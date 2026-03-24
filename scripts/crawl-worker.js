// crawl-worker.js – D1: Crawl im separaten Child-Process (fork)
import { crawl } from './crawl.js'
import { generateReport } from './report.js'

const [,, url, id] = process.argv

if (!url || !id) {
  process.send({ type: 'error', data: 'Fehlende Argumente: url und id erforderlich' })
  process.exit(1)
}

try {
  const manifest = await crawl(url, progress => {
    process.send({ type: 'progress', data: progress })
  }, id, page => {
    process.send({ type: 'page', data: page })
  })

  const report = await generateReport(manifest, id)
  process.send({ type: 'done', data: report })
} catch (err) {
  process.send({ type: 'error', data: err.message })
  process.exit(1)
}
