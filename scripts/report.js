// report.js – Analyse & Report-Generierung (Gesamt + SEO + Mobile)
import { writeFile } from 'fs/promises'
import chalk from 'chalk'
import { calcSeoScore } from './seo.js'

function calcScore(pages) {
  let score = 0
  const types = new Set(pages.map(p => p.type))
  const brokenPages = pages.filter(p => p.statusCode !== 200)
  const avgLoad = pages.reduce((s, p) => s + (p.loadTime ?? 0), 0) / (pages.length || 1)

  if (brokenPages.length === 0) score += 30
  else if (brokenPages.length / pages.length < 0.05) score += 15

  if (avgLoad < 2000) score += 20
  else if (avgLoad < 4000) score += 10

  if (types.has('contact')) score += 15
  if (types.has('legal')) score += 15

  const brokenLinks = pages.flatMap(p => p.links).filter(l =>
    pages.some(p => p.url === l && p.statusCode !== 200)
  )
  if (brokenLinks.length === 0) score += 20
  else if (brokenLinks.length < 3) score += 10

  return Math.min(score, 100)
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
  return weaknesses
}

function buildActions(weaknesses) {
  return weaknesses.map(w => {
    if (w.includes('nicht erreichbar')) return 'Broken Links und 404-Seiten reparieren'
    if (w.includes('Ladezeiten')) return 'Performance optimieren (Bilder komprimieren, Caching)'
    if (w.includes('Kontaktseite')) return 'Kontaktseite anlegen und im Menü verlinken'
    if (w.includes('Impressum')) return 'Impressum und Datenschutzerklärung anlegen'
    if (w.includes('wenige Unterseiten')) return 'Inhaltsstruktur ausbauen'
    return w
  })
}

export async function generateReport(manifest, reportId) {
  const { startUrl, crawledAt, pages, seoPages, mobileData } = manifest

  const score = calcScore(pages)
  const strengths = buildStrengths(pages)
  const weaknesses = buildWeaknesses(pages)
  const actions = buildActions(weaknesses)
  const seo = seoPages?.length ? calcSeoScore(seoPages) : null

  const report = {
    id: reportId,
    url: startUrl,
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
      screenshotPath: p.screenshotPath
    }))
  }

  const filename = `report_${reportId}.json`
  await writeFile(filename, JSON.stringify(report, null, 2))
  console.log(chalk.green(`[report] ${filename} erstellt. Score: ${score}/100  SEO: ${seo?.score ?? '–'}`))
  return report
}
