import express from 'express'
import { readFile, writeFile } from 'fs/promises'
import { readFileSync, existsSync } from 'fs'
import { fork } from 'child_process'
import path from 'path'
import chalk from 'chalk'
import { chromium } from 'playwright'
import client from 'prom-client'
import { randomBytes } from 'crypto'
import QueueManager from './scripts/queue-manager.js'

const { version } = JSON.parse(readFileSync('./package.json', 'utf-8'))
const buildDate = existsSync('./data/build.json')
  ? JSON.parse(readFileSync('./data/build.json', 'utf-8')).buildDate
  : null

const app = express()
const PORT = process.env.PORT || 3001
const jobs = new Map() // id → { status, report }
const queue = new QueueManager()
const pdfDownloadTokens = new Map() // token → { id, expiresAt }
const PDF_TOKEN_TTL_MS = 10 * 60 * 1000 // 10 minutes, single-use
const HISTORY_FILE = 'data/history.json'
const WEBHOOKS_FILE = 'data/webhooks.json'
let processingQueue = false

app.use(express.json())
app.use(express.static('public'))
app.use('/screenshots', express.static('screenshots'))
app.use('/reports', express.static('reports'))

// ── Prometheus Metrics ─────────────────────────────────────────────
const metricsRegistry = new client.Registry()
client.collectDefaultMetrics({ register: metricsRegistry, prefix: 'sitechecker_' })

const crawlsTotal = new client.Counter({
  name: 'sitechecker_crawls_total',
  help: 'Total finished crawl jobs by outcome',
  labelNames: ['status'],
  registers: [metricsRegistry],
})
const crawlDurationSeconds = new client.Histogram({
  name: 'sitechecker_crawl_duration_seconds',
  help: 'Crawl job duration in seconds',
  buckets: [5, 15, 30, 60, 120, 300, 600],
  registers: [metricsRegistry],
})
const crawlsActiveGauge = new client.Gauge({
  name: 'sitechecker_crawls_active',
  help: 'Currently running crawl jobs',
  registers: [metricsRegistry],
})
const crawlStartedAt = new Map() // jobId → Date.now()

app.get('/metrics', async (req, res) => {
  crawlsActiveGauge.set(queue.getStatus?.().running ?? 0)
  res.setHeader('Content-Type', metricsRegistry.contentType)
  res.send(await metricsRegistry.metrics())
})

// ── API-Key-Auth ──────────────────────────────────────────────────
// Health check stays open, everything else requires x-api-key when
// BACKEND_API_KEY is configured (unset = auth disabled, e.g. local dev).
const BACKEND_API_KEY = process.env.BACKEND_API_KEY
if (BACKEND_API_KEY) {
  app.use((req, res, next) => {
    if (req.path === '/version') return next()
    // Playwright's PDF export navigates to /print/:id via http://localhost,
    // and print.html itself then fetches /report/:id client-side from that
    // same loopback connection — neither carries x-api-key, so any request
    // that can only originate from inside this container bypasses auth.
    // An external client can't spoof the loopback source address through Caddy.
    const isLoopback = req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1'
    if (isLoopback) return next()
    if (req.get('x-api-key') === BACKEND_API_KEY) return next()

    // Browser-openable PDF downloads without exposing BACKEND_API_KEY in a URL:
    // a short-lived, single-use token minted by POST /export-pdf/:id/token
    // (itself behind the normal x-api-key check above) substitutes for the
    // header on this one GET route only.
    if (req.method === 'GET' && /^\/export-pdf\/[^/]+$/.test(req.path)) {
      const id = req.path.split('/')[2]
      const token = req.query.token
      const entry = token && pdfDownloadTokens.get(token)
      if (entry && entry.id === id && entry.expiresAt > Date.now()) {
        pdfDownloadTokens.delete(token) // single-use
        return next()
      }
    }

    return res.status(401).json({ error: 'Unauthorized' })
  })
}

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
  // overallScore is the weighted SEO/GEO/Mobile/Security composite — report.score
  // alone only tracks broken links/pages/JS errors and stays near 100 even when
  // SEO or Security are bad, so it would almost never breach a quality threshold.
  const score = report.overallScore ?? report.score
  const webhooks = await readWebhooks()
  for (const wh of webhooks) {
    if (score <= (wh.threshold ?? 70)) {
      try {
        await fetch(wh.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: report.id, url: report.url, score,
            pageCount: report.pageCount, timestamp: report.timestamp
          })
        })
        console.log(chalk.blue(`[webhook] Ausgelöst für ${wh.url} (Score ${score} ≤ ${wh.threshold})`))
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
        queue.updateProgress(id, msg.data)
      }
      if (msg.type === 'page') {
        const job = jobs.get(id)
        if (job) job.pages.push(msg.data)
      }
      if (msg.type === 'done')   resolve(msg.data)
      if (msg.type === 'error')  reject(new Error(msg.data))
    })
    child.on('error', reject)
  })
}

// ── Queue Processing ──────────────────────────────────────────────

async function processQueueLoop() {
  if (processingQueue) return
  processingQueue = true

  try {
    // Start all jobs up to MAX_CONCURRENT_CRAWLS
    while (queue.canStartNextJob()) {
      const job = queue.dequeue()
      if (!job) break

      console.log(chalk.cyan(`[queue] Starte Job: ${job.id} (${job.url})`))
      queue.startJob(job)
      jobs.set(job.id, { status: 'running', progress: { current: 0, max: 20, url: job.url }, pages: [] })
      crawlStartedAt.set(job.id, Date.now())

      // Don't await here – start the crawl and let it run in parallel
      runCrawlWorker(job.url, job.id)
        .then(report => {
          const reportPath = report._reportPath
          delete report._reportPath
          queue.finishJob(job.id, report)
          jobs.set(job.id, { status: 'done', report })
          appendHistory({
            id: job.id, url: report.url, hostname: report.hostname,
            siteTitle: report.siteTitle, siteDescription: report.siteDescription,
            date: report.timestamp, score: report.score, overallScore: report.overallScore,
            pageCount: report.pageCount, reportPath
          }).catch(() => {})
          triggerWebhooks(report).catch(() => {})
          console.log(chalk.green(`[queue] ✓ Job ${job.id} fertig (Score: ${report.score})`))
          queue.save().catch(() => {})
          crawlsTotal.inc({ status: 'done' })
          const startedAt = crawlStartedAt.get(job.id)
          if (startedAt) crawlDurationSeconds.observe((Date.now() - startedAt) / 1000)
          crawlStartedAt.delete(job.id)
          // Try to start next job when one finishes
          setImmediate(processQueueLoop)
        })
        .catch(err => {
          queue.failJob(job.id, err.message)
          jobs.set(job.id, { status: 'error', error: err.message })
          console.error(chalk.red(`[queue] ✗ Job ${job.id} fehlgeschlagen: ${err.message}`))
          queue.save().catch(() => {})
          crawlsTotal.inc({ status: 'error' })
          const startedAt = crawlStartedAt.get(job.id)
          if (startedAt) crawlDurationSeconds.observe((Date.now() - startedAt) / 1000)
          crawlStartedAt.delete(job.id)
          // Try to start next job when one fails
          setImmediate(processQueueLoop)
        })

      await queue.save()
    }
  } finally {
    processingQueue = false
  }
}

// ── Routes ────────────────────────────────────────────────────────

app.get('/version', (req, res) => res.json({ version, buildDate }))

app.get('/history', async (req, res) => {
  res.json(await readHistory())
})

app.delete('/history', async (req, res) => {
  const { ids } = req.body
  if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids muss ein Array sein' })
  const history = await readHistory()
  const filtered = history.filter(h => !ids.includes(h.id))
  await writeFile(HISTORY_FILE, JSON.stringify(filtered, null, 2))
  res.json({ deleted: history.length - filtered.length, remaining: filtered.length })
})

app.post('/check', async (req, res) => {
  const { url } = req.body
  if (!url || !url.startsWith('http')) {
    return res.status(400).json({ error: 'Ungültige URL' })
  }

  // Enqueue the job
  const id = `q_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
  queue.enqueue({ id, url, priority: 5 })
  await queue.save()

  res.json({ id, queue_position: queue.pending.length })

  // Start processing queue
  setImmediate(processQueueLoop)
})

app.get('/status/:id', (req, res) => {
  const id = req.params.id
  // Check in-memory jobs first (legacy)
  let job = jobs.get(id)
  if (job) return res.json({ status: job.status, progress: job.progress ?? null, pages: job.pages ?? [], error: job.error ?? null })
  // Check queue manager
  job = queue.getJob(id)
  if (!job) return res.status(404).json({ error: 'Job nicht gefunden' })
  res.json({ status: job.status, progress: job.progress ?? null, pages: [], error: job.error ?? null })
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
    scoreChange:          (b.overallScore ?? b.score) - (a.overallScore ?? a.score),
    generalScoreChange:   b.score - a.score,
    seoScoreChange:       (b.seo?.score ?? 0) - (a.seo?.score ?? 0),
    geoScoreChange:       (b.geo?.score ?? 0) - (a.geo?.score ?? 0),
    mobileScoreChange:    (b.mobile?.score ?? 0) - (a.mobile?.score ?? 0),
    securityScoreChange:  (b.security?.score ?? 0) - (a.security?.score ?? 0),
    newWeaknesses:        [...weakB].filter(w => !weakA.has(w)),
    resolvedWeaknesses:   [...weakA].filter(w => !weakB.has(w)),
    newPages,
    removedPages,
    pageChanges
  })
})

// ── Queue API Routes ──────────────────────────────────────────────

app.get('/api/queue', (req, res) => {
  res.json(queue.getStatus())
})

app.post('/api/batch', async (req, res) => {
  const { urls } = req.body
  if (!Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ error: 'Array von URLs erforderlich' })
  }

  const { batch_id, job_ids } = await queue.batchEnqueue(urls)

  res.json({
    batch_id,
    job_ids,
    total: urls.length,
    queue_position: queue.pending.length
  })

  setImmediate(processQueueLoop)
})

app.get('/api/batch/:batch_id', (req, res) => {
  const { batch_id } = req.params
  const jobs = Array.from(queue.completed.values()).filter(j => j.batch_id === batch_id)

  res.json({
    batch_id,
    total: jobs.length,
    completed: jobs.length,
    jobs: jobs.map(j => ({
      id: j.id,
      url: j.url,
      status: j.status,
      score: j.report?.score,
      duration_ms: j.duration_ms
    }))
  })
})

app.delete('/api/queue/:job_id', async (req, res) => {
  const { job_id } = req.params
  const deleted = queue.deleteJob(job_id)

  if (!deleted) {
    return res.status(404).json({ error: 'Job nicht gefunden' })
  }

  await queue.save()
  res.json({ status: 'deleted', job_id })
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

// E2 — Print-Seite für Diff
app.get('/print-diff/:idA/:idB', async (req, res) => {
  const [a, b] = await Promise.all([loadReport(req.params.idA), loadReport(req.params.idB)])
  if (!a || !b) return res.status(404).json({ error: 'Ein oder beide Reports nicht gefunden' })
  res.sendFile(path.resolve('public/print-diff.html'))
})

// Mint a short-lived, single-use token for the PDF download link below - lets
// us hand out a browser-openable URL without putting BACKEND_API_KEY in it.
app.post('/export-pdf/:id/token', async (req, res) => {
  const report = await loadReport(req.params.id)
  if (!report) return res.status(404).json({ error: 'Report nicht gefunden' })

  // Opportunistic cleanup of expired entries so the map doesn't grow unbounded.
  const now = Date.now()
  for (const [t, e] of pdfDownloadTokens) {
    if (e.expiresAt <= now) pdfDownloadTokens.delete(t)
  }

  const token = randomBytes(24).toString('base64url')
  pdfDownloadTokens.set(token, { id: req.params.id, expiresAt: now + PDF_TOKEN_TTL_MS })
  res.json({
    token,
    expiresAt: now + PDF_TOKEN_TTL_MS,
    // req.protocol is 'http' here even for external https:// requests - Caddy
    // terminates TLS and forwards plain HTTP internally. Trust x-forwarded-proto
    // (set by Caddy, not client-controllable at that hop) instead.
    url: `${req.get('x-forwarded-proto') || req.protocol}://${req.get('host')}/export-pdf/${encodeURIComponent(req.params.id)}?token=${token}`,
  })
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

// E2 — PDF-Export für Diff via Playwright
app.get('/export-pdf-diff/:idA/:idB', async (req, res) => {
  const { idA, idB } = req.params
  const [a, b] = await Promise.all([loadReport(idA), loadReport(idB)])
  if (!a || !b) return res.status(404).json({ error: 'Ein oder beide Reports nicht gefunden' })

  let browser
  try {
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()
    await page.goto(`http://localhost:${PORT}/print-diff/${idA}/${idB}`, { waitUntil: 'networkidle' })
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '1.5cm', bottom: '1.5cm', left: '1.5cm', right: '1.5cm' }
    })
    const filename = `website-doctor_diff_${idA}_${idB}.pdf`
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.send(pdf)
  } catch (err) {
    console.error(chalk.red(`[pdf-diff] Fehler: ${err.message}`))
    res.status(500).json({ error: 'PDF-Generierung fehlgeschlagen' })
  } finally {
    await browser?.close()
  }
})

app.listen(PORT, async () => {
  // Initialize queue
  await queue.init()

  // Recover stuck-running jobs: after a restart, no worker exists for them anymore
  if (queue.running.size > 0) {
    for (const [id, job] of queue.running) {
      queue.failJob(id, 'Server wurde neu gestartet – Job abgebrochen')
      console.log(chalk.yellow(`[queue] ⚠ Stuck-Job ${id} (${job.url}) zu 'failed' markiert`))
    }
    await queue.save()
  }

  console.log(chalk.green(`[server] Website Doctor v${version} läuft auf http://localhost:${PORT}`))
  console.log(chalk.cyan(`[queue] MAX_CONCURRENT_CRAWLS: 2`))

  // Start processing pending jobs
  if (queue.canStartNextJob()) {
    setImmediate(processQueueLoop)
  }
})
