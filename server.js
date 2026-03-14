import express from 'express'
import { readFile, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import chalk from 'chalk'
import { crawl } from './scripts/crawl.js'
import { generateReport } from './scripts/report.js'

const app = express()
const PORT = process.env.PORT || 3001
const jobs = new Map() // id → { status, report }
const HISTORY_FILE = 'data/history.json'

app.use(express.json())
app.use(express.static('public'))
app.use('/screenshots', express.static('screenshots'))

async function readHistory() {
  try {
    const raw = await readFile(HISTORY_FILE, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return []
  }
}

async function appendHistory(entry) {
  const history = await readHistory()
  history.unshift(entry) // neueste zuerst
  await writeFile(HISTORY_FILE, JSON.stringify(history, null, 2))
}

app.get('/history', async (req, res) => {
  res.json(await readHistory())
})

app.post('/check', async (req, res) => {
  const { url } = req.body
  if (!url || !url.startsWith('http')) {
    return res.status(400).json({ error: 'Ungültige URL' })
  }

  const id = Date.now().toString()
  jobs.set(id, { status: 'running', progress: { current: 0, max: 20, url: '' } })
  res.json({ id })

  try {
    const manifest = await crawl(url, progress => {
      const job = jobs.get(id)
      if (job) job.progress = progress
    })
    const report = await generateReport(manifest, id)
    jobs.set(id, { status: 'done', report })

    await appendHistory({
      id,
      url: report.url,
      date: report.timestamp,
      score: report.score,
      pageCount: report.pageCount
    })
  } catch (err) {
    console.error(chalk.red(`[server] Job ${id} fehlgeschlagen: ${err.message}`))
    jobs.set(id, { status: 'error', error: err.message })
  }
})

app.get('/status/:id', (req, res) => {
  const job = jobs.get(req.params.id)
  if (!job) return res.status(404).json({ error: 'Job nicht gefunden' })
  res.json({ status: job.status, progress: job.progress ?? null })
})

app.get('/report/:id', async (req, res) => {
  const job = jobs.get(req.params.id)
  if (job?.status === 'done') return res.json(job.report)

  const file = `report_${req.params.id}.json`
  if (existsSync(file)) {
    const data = await readFile(file, 'utf-8').catch(() => null)
    if (data) return res.json(JSON.parse(data))
  }

  res.status(404).json({ error: 'Report nicht gefunden' })
})

app.listen(PORT, () => {
  console.log(chalk.green(`[server] Website Doctor läuft auf http://localhost:${PORT}`))
})
