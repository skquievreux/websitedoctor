#!/usr/bin/env node

/**
 * Test Script: Queue-System mit 2 parallelen Crawls
 * Testet: 4 URLs mit MAX_CONCURRENT_CRAWLS=2
 */

const BASE_URL = 'http://localhost:3001'

const testUrls = [
  'https://ki-vergleich.org',
  'https://ai2go.runitfast.xyz',
  'https://dreamedit.runitfast.xyz',
  'https://shader.runitfast.xyz'
]

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

async function main() {
  console.log('\n📊 Test: Queue-System mit 4 URLs\n')

  try {
    // 1. Submit batch
    console.log('1️⃣  Batch einreichen...')
    const batchRes = await fetch(`${BASE_URL}/api/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls: testUrls })
    })
    const batch = await batchRes.json()
    console.log(`   ✓ Batch ID: ${batch.batch_id}`)
    console.log(`   ✓ Jobs: ${batch.total}, Queue-Position: ${batch.queue_position}`)
    console.log()

    // 2. Monitor queue
    console.log('2️⃣  Queue-Status monitoren...')
    let completed = 0
    const maxTime = 15 * 60 * 1000 // 15 minutes max
    const startTime = Date.now()

    while (completed < testUrls.length) {
      const queueRes = await fetch(`${BASE_URL}/api/queue`)
      const status = await queueRes.json()

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0)
      console.log(`[${elapsed}s] Pending: ${status.pending}, Running: ${status.running}, Completed: ${status.completed}`)

      if (status.queue.length > 0) {
        status.queue.forEach(job => {
          const pct = job.progress?.current ? ((job.progress.current / job.progress.max) * 100).toFixed(0) : 0
          console.log(`   ├─ ${job.url.split('/').pop()} - ${pct}%`)
        })
      }

      completed = status.completed
      if (completed >= testUrls.length) break
      if (Date.now() - startTime > maxTime) {
        console.error('   ✗ Timeout!')
        break
      }

      await sleep(5000)
      console.log()
    }

    // 3. Final results
    console.log(`\n3️⃣  Ergebnisse:`)
    const batchRes2 = await fetch(`${BASE_URL}/api/batch/${batch.batch_id}`)
    const results = await batchRes2.json()

    console.log(`   Total: ${results.total}`)
    results.jobs.forEach(j => {
      const status = j.score ? `✓ Score: ${j.score}` : '✗ Failed'
      const duration = j.duration_ms ? ` (${(j.duration_ms / 1000).toFixed(1)}s)` : ''
      console.log(`   ├─ ${j.url}${duration}: ${status}`)
    })

    console.log(`\n✅ Test abgeschlossen!\n`)
  } catch (err) {
    console.error(`\n❌ Fehler: ${err.message}\n`)
    process.exit(1)
  }
}

main()
