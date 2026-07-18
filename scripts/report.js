// report.js – Analyse & Report-Generierung (Gesamt + SEO + Mobile)
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import chalk from 'chalk'
import { calcSeoScore } from './seo-v2.js'

// B3 — Malus-basierter Score (Basis 100, Abzüge)
function calcScore(pages) {
  let score = 100
  const types = new Set(pages.map(p => p.type))
  const brokenPages = pages.filter(p => p.statusCode !== 200)

  // Für Ladezeit-Scoring: domReady bevorzugen (SPA-neutral), sonst loadTime
  // loadTime = Vollladezeit inkl. JS-Hydration, kann bei SPAs stark aufgebläht sein
  const effectiveLoad = p => p.timing?.domReady ?? p.loadTime ?? 0
  const avgLoad = pages.reduce((s, p) => s + effectiveLoad(p), 0) / (pages.length || 1)

  // Pro Broken Page: -10 (max -40)
  score -= Math.min(brokenPages.length * 10, 40)

  // Ladezeit (domReady-basiert)
  if (avgLoad > 4000) score -= 20
  else if (avgLoad > 2000) score -= 10

  // Fehlende Pflichtseiten
  if (!types.has('contact')) score -= 10
  if (!types.has('legal'))   score -= 10

  // Broken Links: -5 pro Link (max -15)
  const brokenLinks = pages.flatMap(p => p.links ?? []).filter(l =>
    pages.some(pg => pg.url === l && pg.statusCode !== 200)
  )
  score -= Math.min(brokenLinks.length * 5, 15)

  // First-Party-JS-Fehler: -5 pro Seite (max -20)
  const pagesWithJsErrors = pages.filter(p => p.jsErrors?.some(e => e.firstParty))
  score -= Math.min(pagesWithJsErrors.length * 5, 20)

  return Math.min(Math.max(score, 0), 100)
}

function buildStrengths(pages) {
  const strengths = []
  const types = new Set(pages.map(p => p.type))
  const avgLoad = pages.reduce((s, p) => s + (p.loadTime ?? 0), 0) / (pages.length || 1)

  if (pages.every(p => p.statusCode === 200)) strengths.push('Alle Seiten sind erreichbar (HTTP 200)')
  if (avgLoad < 2000) strengths.push(`Schnelle Ladezeiten (Ø ${Math.round(avgLoad)} ms)`)
  if (types.has('contact')) strengths.push('Kontaktseite vorhanden')
  if (types.has('legal')) strengths.push('Impressum/Datenschutz vorhanden')
  if (pages.length >= 5) strengths.push(`Gute Seitenanzahl (${pages.length} Seiten gefunden)`)
  if (pages.some(p => p.responseHeaders?.hsts)) strengths.push('HSTS-Header gesetzt (sichere Verbindung)')
  return strengths
}

function buildWeaknesses(pages) {
  const weaknesses = []
  const types = new Set(pages.map(p => p.type))
  const avgLoad = pages.reduce((s, p) => s + (p.loadTime ?? 0), 0) / (pages.length || 1)
  const broken = pages.filter(p => p.statusCode !== 200)

  if (broken.length > 0) weaknesses.push(`${broken.length} Seite(n) nicht erreichbar`)
  if (avgLoad >= 4000) weaknesses.push(`Langsame Ladezeiten (Ø ${Math.round(avgLoad)} ms)`)
  if (!types.has('contact')) weaknesses.push('Keine Kontaktseite gefunden')
  if (!types.has('legal')) weaknesses.push('Kein Impressum/Datenschutz gefunden')
  if (pages.length < 3) weaknesses.push('Sehr wenige Unterseiten gefunden')

  const timingPages = pages.filter(p => p.timing?.ttfb != null && p.timing.ttfb >= 0)
  if (timingPages.length > 0) {
    const avgTtfb = timingPages.reduce((s, p) => s + p.timing.ttfb, 0) / timingPages.length
    if (avgTtfb > 600) weaknesses.push(`Langsame Server-Antwort (TTFB Ø ${Math.round(avgTtfb)} ms)`)
  }

  const noCache = pages.filter(p => !p.responseHeaders?.cacheControl)
  if (noCache.length === pages.length) weaknesses.push('Kein Caching konfiguriert')

  const noHsts = pages.filter(p => p.url.startsWith('https://') && !p.responseHeaders?.hsts)
  if (noHsts.length > 0) weaknesses.push('HSTS-Header fehlt (Sicherheitsrisiko)')

  // A3 — nur First-Party-Fehler als Schwäche melden
  const pagesWithJsErrors = pages.filter(p => p.jsErrors?.some(e => e.firstParty))
  if (pagesWithJsErrors.length > 0) weaknesses.push(`${pagesWithJsErrors.length} Seite(n) haben JavaScript-Fehler`)

  const redirectChainPages = pages.filter(p => (p.redirectCount ?? 0) > 1)
  if (redirectChainPages.length > 0) weaknesses.push(`${redirectChainPages.length} Seite(n) mit Redirect-Ketten (${redirectChainPages.length > 1 ? redirectChainPages.length + ' URLs' : redirectChainPages[0].url})`)

  return weaknesses
}

function buildActions(weaknesses, geoData) {
  const actions = weaknesses.map(w => {
    if (w.includes('nicht erreichbar')) return 'Broken Links und 404-Seiten reparieren'
    if (w.includes('Ladezeiten')) return 'Performance optimieren (Bilder komprimieren, Caching)'
    if (w.includes('Kontaktseite')) return 'Kontaktseite anlegen und im Menü verlinken'
    if (w.includes('Impressum')) return 'Impressum und Datenschutzerklärung anlegen'
    if (w.includes('wenige Unterseiten')) return 'Inhaltsstruktur ausbauen'
    if (w.includes('Server-Antwort')) return 'Server-Antwortzeit reduzieren (Hosting verbessern, CDN, Caching)'
    if (w.includes('Caching')) return 'Cache-Control-Header konfigurieren (z.B. max-age=3600)'
    if (w.includes('HSTS')) return 'HSTS-Header hinzufügen: Strict-Transport-Security: max-age=31536000'
    if (w.includes('JavaScript-Fehler')) return 'JavaScript-Fehler im Browser-Konsolentool analysieren und beheben'
    if (w.includes('Redirect-Ketten')) return 'Redirect-Ketten auf direkte 301-Weiterleitungen reduzieren — jeder zusätzliche Hop kostet Ladezeit und Link-Equity'
    return w
  })

  if (geoData?.checks) {
    for (const c of geoData.checks.filter(c => c.weight > 0 && !c.pass)) {
      const action = c.suggestion || c.label
      if (action && !actions.includes(action)) actions.push(action)
    }
  }

  return actions
}

function calcSecurityScore(pages) {
  const h = pages[0]?.responseHeaders ?? {}
  const checks = [
    { label: 'HTTPS / HSTS',               pass: !!h.hsts,                key: 'hsts',                controllable: false, hint: 'Hosting-/Serverseitig — bei Managed-Hosting oft nicht direkt setzbar' },
    { label: 'X-Frame-Options',            pass: !!h.xFrameOptions,       key: 'xFrameOptions',       controllable: false, hint: 'Server-/CDN-Header (Nginx, Apache, Cloudflare)' },
    { label: 'X-Content-Type-Options',     pass: !!h.xContentTypeOptions, key: 'xContentTypeOptions', controllable: false, hint: 'Server-/CDN-Header' },
    { label: 'Content-Security-Policy',    pass: !!h.csp,                 key: 'csp',                 controllable: false, hint: 'Server-/CDN-Header — komplex, erfordert Whitelist aller Ressourcen' },
    { label: 'Referrer-Policy',            pass: !!h.referrerPolicy,      key: 'referrerPolicy',      controllable: false, hint: 'Server-/CDN-Header' },
    { label: 'Cache-Control konfiguriert', pass: !!h.cacheControl,        key: 'cacheControl',        controllable: true,  hint: 'In Hosting-Konfig oder <meta http-equiv="Cache-Control"> setzbar' },
  ]
  const score = Math.round((checks.filter(c => c.pass).length / checks.length) * 100)
  return { score, checks }
}

function calcOverallScore(generalScore, seoScore, mobileScore, securityScore, geoScore) {
  const weights = { seo: 0.30, geo: 0.25, mobile: 0.20, security: 0.15, general: 0.10 }
  return Math.round(
    (seoScore      ?? 0) * weights.seo +
    (geoScore      ?? 0) * weights.geo +
    (mobileScore   ?? 0) * weights.mobile +
    (securityScore ?? 0) * weights.security +
    (generalScore  ?? 0) * weights.general
  )
}

function calcPerformanceSummary(pages) {
  const withTiming = pages.filter(p => p.timing?.ttfb != null)
  if (!withTiming.length) return null
  const avg = key => {
    const valid = withTiming.filter(p => p.timing[key] != null && p.timing[key] >= 0)
    if (!valid.length) return null
    return Math.round(valid.reduce((s, p) => s + p.timing[key], 0) / valid.length)
  }
  const p75 = (key) => {
    const valid = withTiming.filter(p => p.timing[key] != null && p.timing[key] >= 0)
    if (!valid.length) return null
    const s = [...valid].sort((a, b) => a.timing[key] - b.timing[key])
    return s[Math.floor(s.length * 0.75)]?.timing[key] ?? null
  }
  const allLoad = pages.filter(p => p.loadTime).map(p => p.loadTime).sort((a,b)=>a-b)
  return {
    avgTtfb:        avg('ttfb'),
    avgDomReady:    avg('domReady'),
    avgFullyLoaded: avg('fullyLoaded'),
    p75Ttfb:        p75('ttfb'),
    p75FullyLoaded: p75('fullyLoaded'),
    p50Load:        allLoad[Math.floor(allLoad.length * 0.5)] ?? 0,
    p75Load:        allLoad[Math.floor(allLoad.length * 0.75)] ?? 0,
    slowPages:      pages.filter(p => p.loadTime > 3000).length,
  }
}

function detectTech(pages, seoPages) {
  const hints = []
  const firstPage = seoPages?.[0]
  if (firstPage) {
    const hasReact = pages.some(p => p.jsErrors?.some(e => /react/i.test(e.message)))
    const isVite = pages.some(p => p.title && pages.filter(q => q.title === p.title).length > pages.length * 0.8)
    if (isVite || hasReact) hints.push({ label: 'React / SPA erkannt', severity: 'info', note: 'Meta-Tags werden evtl. per JavaScript gesetzt – für SEO-Crawler evtl. nicht sichtbar.' })
    if (!firstPage.checks?.find(c => c.id === 'structured-data')?.pass) hints.push({ label: 'Kein Structured Data (JSON-LD)', severity: 'warning', note: 'Schema.org-Markup fehlt. Verhindert Rich Snippets in Google.' })
    if (!firstPage.checks?.find(c => c.id === 'og-tags')?.pass) hints.push({ label: 'OpenGraph unvollständig', severity: 'warning', note: 'Social Sharing zeigt keinen richtigen Vorschau-Link.' })
    if (!firstPage.checks?.find(c => c.id === 'canonical')?.pass) hints.push({ label: 'Kein Canonical-Tag', severity: 'critical', note: 'Duplicate-Content-Risiko – Google könnte falsche URL indexieren.' })
  }
  return hints
}

function buildPriorityIssues(pages, seoPages, weaknesses, geoData) {
  const issues = []

  // From weaknesses
  const weaknessSeverity = (w) => {
    if (w.includes('nicht erreichbar') || w.includes('JavaScript-Fehler')) return 'critical'
    if (w.includes('Ladezeiten') || w.includes('Server-Antwort') || w.includes('HSTS')) return 'warning'
    return 'info'
  }
  weaknesses.forEach(w => issues.push({ label: w, severity: weaknessSeverity(w), source: 'general' }))

  // Critical SEO fails across pages
  const criticalSeoIds = ['robots', 'canonical', 'title-present', 'h1-count']
  const seoFailCounts = {}
  for (const p of (seoPages ?? [])) {
    for (const c of (p.checks ?? [])) {
      if (!c.pass && !c.skipped && criticalSeoIds.includes(c.id)) {
        seoFailCounts[c.id] = (seoFailCounts[c.id] ?? 0) + 1
      }
    }
  }
  for (const [id, count] of Object.entries(seoFailCounts)) {
    const label = { robots: 'Seiten auf noindex', canonical: 'Canonical-Tag fehlt', 'title-present': 'Seiten ohne Title', 'h1-count': 'H1 fehlt oder mehrfach' }[id]
    issues.push({ label: `${label} (${count} Seiten)`, severity: id === 'robots' ? 'critical' : 'warning', source: 'seo' })
  }

  // GEO-Kritische Checks (blockierte AI-Bots → immer critical, andere je nach Pass)
  if (geoData?.checks) {
    for (const c of geoData.checks.filter(c => c.weight > 0 && !c.pass)) {
      const isAiBot = c.id === 'ai-bots-allowed'
      issues.push({
        label: c.label,
        severity: isAiBot ? 'critical' : 'warning',
        source: 'geo',
        note: c.suggestion || null,
      })
    }
  }

  // Sort: critical first
  const order = { critical: 0, warning: 1, info: 2 }
  issues.sort((a, b) => order[a.severity] - order[b.severity])
  return issues
}

function buildTopDeviations(pages, seoPages, mobileData) {
  const avgLoad = pages.reduce((s, p) => s + (p.loadTime ?? 0), 0) / (pages.length || 1)

  const scored = pages.map(p => {
    const seo = seoPages?.find(s => s.url === p.url)
    const mobile = mobileData?.pages?.find(m => m.url === p.url)

    let penalty = 0
    const reasons = []

    // SEO-Fails: jeder fehlgeschlagene gewichtete Check zählt
    if (seo) {
      const failedWeight = seo.checks.filter(c => !c.pass && !c.skipped && c.weight > 0)
                                     .reduce((s, c) => s + c.weight, 0)
      penalty += failedWeight
      if (failedWeight > 0) reasons.push(`SEO: ${seo.score}/100`)
    }

    // Ladezeit-Abweichung über Durchschnitt
    const loadDelta = (p.loadTime ?? 0) - avgLoad
    if (loadDelta > 1000) {
      penalty += Math.min(Math.round(loadDelta / 500), 20)
      reasons.push(`${p.loadTime} ms Ladezeit`)
    }

    // JS-Fehler
    const jsErrCount = p.jsErrors?.filter(e => e.firstParty).length ?? 0
    if (jsErrCount > 0) {
      penalty += jsErrCount * 5
      reasons.push(`${jsErrCount} JS-Fehler`)
    }

    // HTTP-Fehler
    if (p.statusCode !== 200) {
      penalty += 50
      reasons.push(`HTTP ${p.statusCode}`)
    }

    const screenshotPath = mobile?.screenshotPath || p.screenshotPath || null

    return { url: p.url, title: p.title, penalty, reasons, screenshotPath, seoScore: seo?.score ?? null, loadTime: p.loadTime ?? null }
  })

  return scored
    .filter(p => p.penalty > 0 && p.screenshotPath)
    .sort((a, b) => b.penalty - a.penalty)
    .slice(0, 3)
}

export async function generateReport(manifest, reportId) {
  const { startUrl, crawledAt, hostname, pages, seoPages, geoData, mobileData } = manifest

  const score = calcScore(pages)
  const strengths = buildStrengths(pages)
  const weaknesses = buildWeaknesses(pages)
  const actions = buildActions(weaknesses, geoData)
  const seo = seoPages?.length ? calcSeoScore(seoPages) : null

  // Beschreibung der Startseite aus SEO-Daten
  const homeSeo = seoPages?.[0]
  const siteDescription = homeSeo?.metaDescription || null
  const siteTitle = homeSeo?.pageTitle || null

  const security = calcSecurityScore(pages)
  const finalOverallScore = calcOverallScore(score, seo?.score, mobileData?.score, security.score, geoData?.score)
  const performanceSummary = calcPerformanceSummary(pages)
  const techHints = detectTech(pages, seoPages)
  const priorityIssues = buildPriorityIssues(pages, seoPages, weaknesses, geoData)
  const topDeviations = buildTopDeviations(pages, seoPages, mobileData)

  const report = {
    id: reportId,
    url: startUrl,
    hostname: hostname || new URL(startUrl).hostname,
    siteTitle,
    siteDescription,
    timestamp: crawledAt,
    pageCount: pages.length,
    score,
    overallScore: finalOverallScore,
    strengths,
    weaknesses,
    actions,
    priorityIssues,
    security,
    performanceSummary,
    techHints,
    topDeviations,
    seo,
    geo: geoData ?? null,
    mobile: mobileData ?? null,
    pages: pages.map(p => ({
      url: p.url,
      type: p.type,
      statusCode: p.statusCode,
      title: p.title,
      loadTime: p.loadTime,
      timing: p.timing ?? null,
      responseHeaders: p.responseHeaders ?? {},
      jsErrors: p.jsErrors ?? [],
      screenshotPath: p.screenshotPath,
      redirectCount: p.redirectCount ?? 0,
    }))
  }

  // Dateipfad: reports/{hostname}/{reportId}.json
  const dir = path.join('reports', report.hostname)
  await mkdir(dir, { recursive: true })
  const reportPath = path.join(dir, `${reportId}.json`).replace(/\\/g, '/')
  await writeFile(reportPath, JSON.stringify(report, null, 2))

  console.log(chalk.green(`[report] ${reportPath} erstellt. Score: ${score}/100  SEO: ${seo?.score ?? '–'}  GEO: ${geoData?.score ?? '–'}`))

  // _reportPath für server.js, wird dort entfernt bevor es in den Job-Cache kommt
  report._reportPath = reportPath
  return report
}
