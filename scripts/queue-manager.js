// queue-manager.js – Queue-basierte Crawl-Orchestrierung
// Limitiert parallele Crawls auf MAX_CONCURRENT_CRAWLS
// Persistent, FIFO-basiert mit Prioritäts-Support

import { readFile, writeFile } from 'fs/promises'
import { existsSync } from 'fs'

const QUEUE_FILE = 'data/queue.json'
const MAX_CONCURRENT_CRAWLS = 2
const CLEANUP_AFTER_HOURS = 24

export class QueueManager {
  constructor() {
    this.pending = []
    this.running = new Map()
    this.completed = new Map()
    this.failed = new Map()
    this.initialized = false
  }

  async init() {
    await this.load()
    this.initialized = true
    console.log(`[queue] Initialized: ${this.pending.length} pending, ${this.running.size} running`)
  }

  async load() {
    try {
      if (!existsSync(QUEUE_FILE)) return
      const data = JSON.parse(await readFile(QUEUE_FILE, 'utf-8'))
      this.pending = data.pending || []
      this.running = new Map(data.running || [])
      this.completed = new Map(data.completed || [])
      this.failed = new Map(data.failed || [])
    } catch (err) {
      console.warn(`[queue] Could not load queue: ${err.message}`)
    }
  }

  async save() {
    const data = {
      pending: this.pending,
      running: Array.from(this.running.entries()),
      completed: Array.from(this.completed.entries()),
      failed: Array.from(this.failed.entries()),
      saved: new Date().toISOString()
    }
    await writeFile(QUEUE_FILE, JSON.stringify(data, null, 2))
  }

  enqueue(job) {
    // job = { id, url, priority?, batch_id?, ... }
    if (!job.id || !job.url) throw new Error('Job muss id und url haben')

    job.priority = job.priority ?? 0
    job.created = new Date().toISOString()
    job.status = 'pending'

    // Insert sorted by priority (höher zuerst)
    const idx = this.pending.findIndex(j => j.priority < job.priority)
    if (idx === -1) {
      this.pending.push(job)
    } else {
      this.pending.splice(idx, 0, job)
    }

    return job.id
  }

  dequeue() {
    return this.pending.shift()
  }

  startJob(job) {
    if (this.running.size >= MAX_CONCURRENT_CRAWLS) {
      return false // Can't start yet
    }

    job.status = 'running'
    job.started = new Date().toISOString()
    this.running.set(job.id, job)

    return true
  }

  finishJob(jobId, report) {
    const job = this.running.get(jobId)
    if (!job) return

    job.status = 'completed'
    job.completed = new Date().toISOString()
    job.duration_ms = new Date(job.completed) - new Date(job.started)
    job.report = report

    this.completed.set(jobId, job)
    this.running.delete(jobId)
  }

  failJob(jobId, error) {
    const job = this.running.get(jobId)
    if (!job) return

    job.status = 'failed'
    job.failed = new Date().toISOString()
    job.error = error

    this.failed.set(jobId, job)
    this.running.delete(jobId)
  }

  getStatus() {
    return {
      pending: this.pending.length,
      running: this.running.size,
      completed: this.completed.size,
      failed: this.failed.size,
      max_concurrent: MAX_CONCURRENT_CRAWLS,
      queue: [
        ...Array.from(this.running.values()).map(j => ({
          id: j.id,
          url: j.url,
          progress: j.progress,
          started: j.started,
          _type: 'running'
        })),
        ...this.pending.slice(0, 5).map(j => ({
          id: j.id,
          url: j.url,
          _type: 'pending'
        }))
      ]
    }
  }

  canStartNextJob() {
    return this.running.size < MAX_CONCURRENT_CRAWLS && this.pending.length > 0
  }

  getNext() {
    return this.pending[0] || null
  }

  getJob(jobId) {
    return (
      this.running.get(jobId) ||
      this.completed.get(jobId) ||
      this.failed.get(jobId)
    )
  }

  updateProgress(jobId, progress) {
    const job = this.running.get(jobId)
    if (job) {
      job.progress = progress
    }
  }

  async cleanup() {
    // Remove completed/failed jobs older than CLEANUP_AFTER_HOURS
    const cutoff = new Date(Date.now() - CLEANUP_AFTER_HOURS * 3600 * 1000)

    for (const [id, job] of this.completed) {
      if (new Date(job.completed) < cutoff) {
        this.completed.delete(id)
      }
    }

    for (const [id, job] of this.failed) {
      if (new Date(job.failed) < cutoff) {
        this.failed.delete(id)
      }
    }

    await this.save()
  }

  async batchEnqueue(urls) {
    // Utility: Enqueue multiple URLs
    const batchId = Date.now().toString()
    const jobIds = []

    for (const url of urls) {
      const jobId = this.enqueue({
        id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        url,
        batch_id: batchId
      })
      jobIds.push(jobId)
    }

    await this.save()
    return { batch_id: batchId, job_ids: jobIds }
  }
}

export default QueueManager
