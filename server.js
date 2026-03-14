import express from 'express'
import { readFile, writeFile } from 'fs/promises'
import { readFileSync, existsSync } from 'fs'
import { fork } from 'child_process'
import path from 'path'
import chalk from 'chalk'
import { chromium } from 'playwright'
import { generateReport } from './scripts/report.js'

const { version } = JSON.parse(readFileSync('./package.json', 'utf-8'))

const app = express()
const PORT = process.env.PORT || 3001
const jobs = new Map() // id → { status, report }
const HISTORY_FILE = 'data/history.json'
const WEBHOOKS_FILE = 'data/webhooks.json'

app.use(express.json())
app.use(express.static('public'))
app.use('/screenshots', express.static('screenshots'))
app.use('/reports', express.static('reports'))

// ── History ───────────────────────────────────────────────────────

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
  history.unshift(entry)
  await writeFile(HISTORY_FILE, JSON.stringify(history, null, 2))
}

// ── Report-Lookup (shared by /report/:id and /diff) ───────────────

async function loadReport(id) {
  const job = jobs.get(id)
  if (job?.status === 'done') return job.report

  const history = await readHistory()
  const entry = history.find(h => h.id === id)
  if (entry?.reportPath && existsSync(entry.reportPath)) {
    const data = await readFile(entry.reportPath, 'utf-8').catch(() => null)
    if (data) return JSON.parse(data)
  }

  const legacyFile = `reports/legacy/report_${id}.json`
  if (existsSync(legacyFile)) {
    const data = await readFile(legacyFile, 'utf-8').catch(() => null)
    if (data) return JSON.parse(data)
  }

  return null
}

// ── Webhooks ──────────────────────────────────────────────────────

async function readWebhooks() {
  try {
    const raw = await readFile(WEBHOOKS_FILE, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return []
  }
}

async function triggerWebhooks(report) {
  const webhooks = await readWebhooks()
  for (const wh of webhooks) {
    if (report.score <= (wh.threshold ?? 70)) {
      try {
        await fetch(wh.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: report.id, url: report.url, score: report.score,
            pageCount: report.pageCount, timestamp: report.timestamp
          })
        })
        console.log(chalk.blue(`[webhook] Ausgelöst für ${wh.url} (Score ${report.score} ≤ ${wh.threshold})`))
      } catch (err) {
        console.error(chalk.red(`[webhook] Fehler: ${err.message}`))
      }
    }
  }
}

// ── D1 — Crawl als Child-Process ──────────────────────────────────

function runCrawlWorker(url, id) {
  return new Promise((resolve, reject) => {
    const child = fork('./scripts/crawl-worker.js', [url, id])
    child.on('message', msg => {
      if (msg.type === 'progress') {
        const job = jobs.get(id)
        if (job) job.progress = msg.data
      }
      if (msg.type === 'done')   resolve(msg.data)
      if (msg.type === 'error')  reject(new Error(msg.data))
    })
    child.on('error', reject)
  })
}

// ── Routes ────────────────────────────────────────────────────────

app.get('/version', (req, res) => res.json({ version }))

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
    // D1 — Crawl im separaten Child-Process
    const report = await runCrawlWorker(url, id)
    const reportPath = report._reportPath
    delete report._reportPath

    jobs.set(id, { status: 'done', report })

    await appendHistory({
      id, url: report.url, hostname: report.hostname,
      siteTitle: report.siteTitle, siteDescription: report.siteDescription,
      date: report.timestamp, score: report.score, pageCount: report.pageCount, reportPath
    })

    // D2 — Webhooks auslösen wenn Score unter Schwellwert
    triggerWebhooks(report).catch(() => {})
  } catch (err) {
    console.error(chalk.red(`[server] Job ${id} fehlgeschlagen: ${err.message}`))
    jobs.set(id, { status: 'error', error: err.message })
  }
})

app.get('/status/:id', (req, res) => {
  const job = jobs.get(req.params.id)
  if (!job) return res.status(404).json({ error: 'Job nicht gefunden' })
  res.json({ status: job.status, progress: job.progress ?? null, error: job.error ?? null })
})

app.get('/report/:id', async (req, res) => {
  const report = await loadReport(req.params.id)
  if (!report) return res.status(404).json({ error: 'Report nicht gefunden' })
  res.json(report)
})

// C1 — Diff: zwei Reports vergleichen
app.get('/diff/:idA/:idB', async (req, res) => {
  const [a, b] = await Promise.all([
    loadReport(req.params.idA),
    loadReport(req.params.idB)
  ])
  if (!a || !b) return res.status(404).json({ error: 'Ein oder beide Reports nicht gefunden' })

  const urlsA = new Set(a.pages.map(p => p.url))
  const urlsB = new Set(b.pages.map(p => p.url))
  const newPages     = [...urlsB].filter(u => !urlsA.has(u))
  const removedPages = [...urlsA].filter(u => !urlsB.has(u))

  const pageChanges = []
  for (const pb of b.pages) {
    const pa = a.pages.find(p => p.url === pb.url)
    if (!pa) continue
    const loadTimeChange = (pb.loadTime ?? 0) - (pa.loadTime ?? 0)
    const jsErrorsChange = (pb.jsErrors?.filter(e => e.firstParty).length ?? 0)
                         - (pa.jsErrors?.filter(e => e.firstParty).length ?? 0)
    if (loadTimeChange !== 0 || jsErrorsChange !== 0) {
      pageChanges.push({ url: pb.url, loadTimeChange, jsErrorsChange })
    }
  }

  const weakA = new Set(a.weaknesses)
  const weakB = new Set(b.weaknesses)

  res.json({
    idA: a.id, idB: b.id,
    urlA: a.url, urlB: b.url,
    scoreChange: b.score - a.score,
    seoScoreChange: (b.seo?.score ?? 0) - (a.seo?.score ?? 0),
    newWeaknesses:      [...weakB].filter(w => !weakA.has(w)),
    resolvedWeaknesses: [...weakA].filter(w => !weakB.has(w)),
    newPages,
    removedPages,
    pageChanges
  })
})

// D2 — Webhook registrieren
app.post('/webhooks', async (req, res) => {
  const { url, threshold = 70 } = req.body
  if (!url || !url.startsWith('http')) return res.status(400).json({ error: 'Ungültige URL' })
  const webhooks = await readWebhooks()
  const existing = webhooks.findIndex(w => w.url === url)
  if (existing >= 0) webhooks[existing] = { url, threshold }
  else webhooks.push({ url, threshold })
  await writeFile(WEBHOOKS_FILE, JSON.stringify(webhooks, null, 2))
  res.json({ ok: true, webhooks })
})

app.get('/webhooks', async (req, res) => {
  res.json(await readWebhooks())
})

app.delete('/webhooks', async (req, res) => {
  const { url } = req.body
  const webhooks = (await readWebhooks()).filter(w => w.url !== url)
  await writeFile(WEBHOOKS_FILE, JSON.stringify(webhooks, null, 2))
  res.json({ ok: true, webhooks })
})

// E1 — Print-Seite (druckoptimiertes HTML)
app.get('/print/:id', async (req, res) => {
  const report = await loadReport(req.params.id)
  if (!report) return res.status(404).json({ error: 'Report nicht gefunden' })
  res.sendFile(path.resolve('public/print.html'))
})

// E1 — PDF-Export via Playwright
app.get('/export-pdf/:id', async (req, res) => {
  const report = await loadReport(req.params.id)
  if (!report) return res.status(404).json({ error: 'Report nicht gefunden' })

  let browser
  try {
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()
    await page.goto(`http://localhost:${PORT}/print/${req.params.id}`, { waitUntil: 'networkidle' })
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '1.5cm', bottom: '1.5cm', left: '1.5cm', right: '1.5cm' }
    })
    const filename = `website-doctor_${report.hostname}_${req.params.id}.pdf`
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.send(pdf)
  } catch (err) {
    console.error(chalk.red(`[pdf] Fehler: ${err.message}`))
    res.status(500).json({ error: 'PDF-Generierung fehlgeschlagen' })
  } finally {
    await browser?.close()
  }
})

app.listen(PORT, () => {
  console.log(chalk.green(`[server] Website Doctor v${version} läuft auf http://localhost:${PORT}`))
})
