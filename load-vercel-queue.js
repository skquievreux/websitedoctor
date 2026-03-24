#!/usr/bin/env node

/**
 * Lade alle 26 öffentlichen Vercel-Projekte in die Queue
 */

import { readFile } from 'fs/promises'

const BASE_URL = 'http://localhost:3001'

async function main() {
  try {
    // Lade audit-queue.json
    const queueData = JSON.parse(await readFile('data/audit-queue.json', 'utf-8'))
    const urls = queueData.queue.pending.map(j => j.url)

    console.log(`\n📊 Lade ${urls.length} Vercel-Projekte in Queue...\n`)

    // Submit batch
    const res = await fetch(`${BASE_URL}/api/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls })
    })

    if (!res.ok) {
      console.error(`❌ Fehler: ${res.status} ${res.statusText}`)
      process.exit(1)
    }

    const batch = await res.json()

    console.log(`✅ Batch eingereiht!`)
    console.log(`   Batch ID: ${batch.batch_id}`)
    console.log(`   Jobs: ${batch.total}`)
    console.log(`   Queue-Position: ${batch.queue_position}`)
    console.log(`\n💡 Monitoring starten mit: node test-queue.js`)
    console.log(`   Oder öffne: http://localhost:3001\n`)
  } catch (err) {
    console.error(`❌ Fehler: ${err.message}`)
    process.exit(1)
  }
}

main()
