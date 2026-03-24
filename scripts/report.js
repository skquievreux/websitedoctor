// report.js – Analyse & Report-Generierung (Gesamt + SEO + Mobile)
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import chalk from 'chalk'
import { calcSeoScore } from './seo.js'

// B3 — Malus-basierter Score (Basis 100, Abzüge)
function calcScore(pages) {
  let score = 100
  const types = new Set(pages.map(p => p.type))
  const brokenPages = pages.filter(p => p.statusCode !== 200)
  const avgLoad = pages.reduce((s, p) => s + (p.loadTime ?? 0), 0) / (pages.length || 1)

  // Pro Broken Page: -10 (max -40)
  score -= Math.min(brokenPages.length * 10, 40)

  // Ladezeit
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

  return weaknesses
}

function buildActions(weaknesses) {
  return weaknesses.map(w => {
    if (w.includes('nicht erreichbar')) return 'Broken Links und 404-Seiten reparieren'
    if (w.includes('Ladezeiten')) return 'Performance optimieren (Bilder komprimieren, Caching)'
    if (w.includes('Kontaktseite')) return 'Kontaktseite anlegen und im Menü verlinken'
    if (w.includes('Impressum')) return 'Impressum und Datenschutzerklärung anlegen'
    if (w.includes('wenige Unterseiten')) return 'Inhaltsstruktur ausbauen'
    if (w.includes('Server-Antwort')) return 'Server-Antwortzeit reduzieren (Hosting verbessern, CDN, Caching)'
    if (w.includes('Caching')) return 'Cache-Control-Header konfigurieren (z.B. max-age=3600)'
    if (w.includes('HSTS')) return 'HSTS-Header hinzufügen: Strict-Transport-Security: max-age=31536000'
    if (w.includes('JavaScript-Fehler')) return 'JavaScript-Fehler im Browser-Konsolentool analysieren und beheben'
    return w
  })
}

export async function generateReport(manifest, reportId) {
  const { startUrl, crawledAt, hostname, pages, seoPages, mobileData } = manifest

  const score = calcScore(pages)
  const strengths = buildStrengths(pages)
  const weaknesses = buildWeaknesses(pages)
  const actions = buildActions(weaknesses)
  const seo = seoPages?.length ? calcSeoScore(seoPages) : null

  // Beschreibung der Startseite aus SEO-Daten
  const homeSeo = seoPages?.[0]
  const siteDescription = homeSeo?.metaDescription || null
  const siteTitle = homeSeo?.pageTitle || null

  const report = {
    id: reportId,
    url: startUrl,
    hostname: hostname || new URL(startUrl).hostname,
    siteTitle,
    siteDescription,
    timestamp: crawledAt,
    pageCount: pages.length,
    score,
    strengths,
    weaknesses,
    actions,
    seo,
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
      screenshotPath: p.screenshotPath
    }))
  }

  // Dateipfad: reports/{hostname}/{reportId}.json
  const dir = path.join('reports', report.hostname)
  await mkdir(dir, { recursive: true })
  const reportPath = path.join(dir, `${reportId}.json`).replace(/\\/g, '/')
  await writeFile(reportPath, JSON.stringify(report, null, 2))

  console.log(chalk.green(`[report] ${reportPath} erstellt. Score: ${score}/100  SEO: ${seo?.score ?? '–'}`))

  // _reportPath für server.js, wird dort entfernt bevor es in den Job-Cache kommt
  report._reportPath = reportPath
  return report
}
