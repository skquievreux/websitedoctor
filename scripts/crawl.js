// crawl.js – Playwright Loop · Seiten besuchen · Screenshots · SEO
// v1.1.0: Navigation Timing v2, finally-Listener-Cleanup, Third-Party-Filter
// v1.2.0: Scrapling/Camoufox-Fallback für Bot-geblockte Seiten (D2)
import { chromium } from 'playwright'
import { writeFile, mkdir } from 'fs/promises'
import { execFile } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import chalk from 'chalk'
import { extractLinks, filterLinks, guessPageType } from './links.js'
import { analyzeSeoV2, computeSeoFromData } from './seo-v2.js'
import { crawlMobile } from './mobile.js'
import { analyzeGeoPage, analyzeGeoSite, fetchSiteFiles } from './geo.js'

const execFileAsync = promisify(execFile)

const MAX_PAGES = 20
const TIMEOUT = 10000
const STEALTH_FALLBACK_TIMEOUT = 30000
const PYTHON_BIN = process.env.PYTHON_BIN || 'python3'

// Neutral GEO-Platzhalter für Seiten, die nur über den Stealth-Fallback
// geladen wurden — analyzeGeoSite() erwartet dieses Shape für jede Seite
// (siehe geo.js's eigener page.evaluate().catch()-Default), aber der
// Fallback liefert keine Live-DOM-Daten für die GEO-Heuristiken.
const NEUTRAL_GEO_RESULT = {
  schemaTypes: [], entityLinks: [], qaCount: 0, qaExamples: [], wordCount: 0,
  tableCount: 0, listCount: 0, structuredCount: 0, factDensity: 0, factCount: 0,
  totalLinks: 0, genericLinks: 0, genericRatio: 0, snippetPreview: '',
  hasJsonLd: false, jsonLdCount: 0,
}

// A3-artige Erkennung: typische Bot-Block-Signale, bei denen ein normaler
// Chromium-Aufruf mit hoher Wahrscheinlichkeit nie mehr Inhalt bekommt,
// egal wie oft man's wiederholt (Cloudflare/PerimeterX/DataDome-Challenges).
const BOT_BLOCK_STATUS = new Set([403, 429, 503])
const BOT_BLOCK_TITLE_PATTERNS = [
  /just a moment/i, /attention required/i, /access denied/i,
  /verify you are human/i, /checking your browser/i, /ddos protection by/i,
]

function looksBotBlocked({ statusCode, title }) {
  if (statusCode !== null && BOT_BLOCK_STATUS.has(statusCode)) return true
  return BOT_BLOCK_TITLE_PATTERNS.some(p => p.test(title || ''))
}

// ponytail: shellt auf einen einzelnen Python-Prozess pro URL statt einen
// persistenten Sidecar-Service zu bauen — Scrapling/Camoufox-Fallback ist
// die Ausnahme (wenige URLs pro Crawl), kein Hot Path. Wenn das häufiger
// als vereinzelt greift, lohnt sich ein warmer Worker-Pool.
async function runStealthFallback(url, screenshotPath) {
  try {
    const { stdout } = await execFileAsync(
      PYTHON_BIN,
      ['scripts/stealth_fetch.py', url, screenshotPath],
      { timeout: STEALTH_FALLBACK_TIMEOUT, maxBuffer: 10 * 1024 * 1024 }
    )
    const result = JSON.parse(stdout)
    if (result.error) throw new Error(result.error)
    return result
  } catch (err) {
    console.error(chalk.red(`[crawl] Stealth-Fallback fehlgeschlagen für ${url}: ${err.message}`))
    return null
  }
}

// A3 — Third-Party-Domains die harmlose Fehler produzieren
const THIRD_PARTY_PATTERNS = [
  /doubleclick\.net/, /googlesyndication/, /googletagmanager/,
  /google-analytics/, /analytics\.google/, /facebook\.net/,
  /connect\.facebook/, /cookiebot/, /usercentrics/,
  /hotjar\.com/, /clarity\.ms/, /hubspot\.com/
]

function isFirstPartyError(message) {
  return !THIRD_PARTY_PATTERNS.some(p => p.test(message))
}

function slugify(url) {
  return url.replace(/https?:\/\//, '').replace(/[^a-z0-9]/gi, '-').slice(0, 80)
}

async function takeScreenshot(page, url, screenshotDir) {
  const filename = `${slugify(url)}.png`
  const filepath = path.join(screenshotDir, filename)
  try {
    await page.screenshot({ path: filepath, fullPage: true })
    return filepath.replace(/\\/g, '/') // Forward-Slashes für URLs
  } catch {
    return null
  }
}

async function visitPage(page, url) {
  const start = Date.now()
  const jsErrors = []
  let redirectCount = 0

  // A2 — benannte Listener für sauberes off() im finally
  const handleConsole = msg => {
    if (msg.type() !== 'error') return
    const message = msg.text()
    jsErrors.push({ message, type: 'console-error', firstParty: isFirstPartyError(message) })
  }
  const handlePageError = err => {
    const message = err.message
    jsErrors.push({ message, url: err.stack?.split('\n')[1]?.trim(), type: 'uncaught', firstParty: isFirstPartyError(message) })
  }
  const handleResponse = response => {
    if ([301, 302, 307, 308].includes(response.status())) redirectCount++
  }

  page.on('console', handleConsole)
  page.on('pageerror', handlePageError)
  page.on('response', handleResponse)

  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT })
    // Wait briefly for JS-injected meta tags (React Helmet, Next.js Head, etc.)
    // This fixes false negatives where JSON-LD / title are set after domcontentloaded
    await page.waitForSelector('script[type="application/ld+json"], title', { timeout: 2000 }).catch(() => {})
    const loadTime = Date.now() - start
    const statusCode = response?.status() ?? null
    const title = await page.title().catch(() => '')

    // A1 — Navigation Timing API v2
    const timing = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0]
      if (!nav) return null
      const fullyLoaded = Math.round(nav.loadEventEnd - nav.requestStart)
      return {
        ttfb:        Math.round(nav.responseStart - nav.requestStart),
        domReady:    Math.round(nav.domContentLoadedEventEnd - nav.requestStart),
        fullyLoaded: fullyLoaded > 0 ? fullyLoaded : null,
        dnsLookup:   Math.round(nav.domainLookupEnd - nav.domainLookupStart),
        tcpConnect:  Math.round(nav.connectEnd - nav.connectStart),
      }
    }).catch(() => null)

    const headers = response?.headers() ?? {}
    const responseHeaders = {
      cacheControl:        headers['cache-control'] || null,
      hsts:                headers['strict-transport-security'] || null,
      xFrameOptions:       headers['x-frame-options'] || null,
      xContentTypeOptions: headers['x-content-type-options'] || null,
      csp:                 headers['content-security-policy'] || null,
      referrerPolicy:      headers['referrer-policy'] || null,
      server:              headers['server'] || null,
    }

    return { statusCode, title, loadTime, timing, responseHeaders, jsErrors, redirectCount }
  } catch (err) {
    console.error(chalk.red(`[crawl] Fehler bei ${url}: ${err.message}`))
    return { statusCode: null, title: '', loadTime: null, timing: null, responseHeaders: {}, jsErrors, redirectCount }
  } finally {
    // A2 — immer aufräumen
    page.off('console', handleConsole)
    page.off('pageerror', handlePageError)
    page.off('response', handleResponse)
  }
}

export async function crawl(startUrl, onProgress, reportId = Date.now().toString(), onPageDone = () => {}) {
  const hostname = new URL(startUrl).hostname
  const screenshotDir = path.join('screenshots', hostname, reportId)
  await mkdir(screenshotDir, { recursive: true })

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext()
  const page = await context.newPage()

  const visited = new Set()
  const queue = [startUrl]
  const pages = []
  const seoPages = []
  const geoPages = []

  console.log(chalk.blue(`[crawl] Start: ${startUrl}`))

  // GEO: robots.txt, ai.txt, llms.txt parallel zum Crawl holen
  const siteFilesPromise = fetchSiteFiles(startUrl)

  while (queue.length > 0 && visited.size < MAX_PAGES) {
    const url = queue.shift()
    if (visited.has(url)) continue
    visited.add(url)

    console.log(chalk.gray(`[crawl] Besuche (${visited.size}/${MAX_PAGES}): ${url}`))
    onProgress?.({ current: visited.size, max: MAX_PAGES, url })

    let { statusCode, title, loadTime, timing, responseHeaders, jsErrors, redirectCount } = await visitPage(page, url)
    let screenshotPath = await takeScreenshot(page, url, screenshotDir)
    let seoResult, geoResult, links

    if (looksBotBlocked({ statusCode, title })) {
      console.log(chalk.yellow(`[crawl] Bot-Block erkannt (${statusCode ?? 'kein Status'}) bei ${url} – versuche Scrapling-Fallback`))
      const fallbackScreenshotPath = path.join(screenshotDir, `${slugify(url)}.png`)
      const fallback = await runStealthFallback(url, fallbackScreenshotPath)
      if (fallback) {
        statusCode = fallback.statusCode
        title = fallback.title
        loadTime = fallback.loadTime
        screenshotPath = fallback.screenshotPath
        seoResult = computeSeoFromData(fallback.seo, url)
        geoResult = { url, ...NEUTRAL_GEO_RESULT }
        links = filterLinks(fallback.links, startUrl)
        jsErrors = []
        redirectCount = 0
      }
    }

    if (!seoResult) {
      ;[seoResult, geoResult] = await Promise.all([
        analyzeSeoV2(page, url),
        analyzeGeoPage(page, url),
      ])
      const rawLinks = await extractLinks(page)
      links = filterLinks(rawLinks, startUrl)
    }
    const type = guessPageType(url)

    const fp = jsErrors.filter(e => e.firstParty).length
    const tp = jsErrors.filter(e => !e.firstParty).length
    if (jsErrors.length > 0) {
      console.log(chalk.yellow(`[crawl] JS-Fehler auf ${url}: ${fp} first-party, ${tp} third-party (ignoriert)`))
    }

    pages.push({ url, statusCode, title, type, screenshotPath, links, loadTime, timing, responseHeaders, jsErrors, redirectCount })
    seoPages.push(seoResult)
    geoPages.push(geoResult)
    onPageDone?.({ url, statusCode, title, type, loadTime, screenshotPath, jsErrors: jsErrors ?? [] })

    if (visited.size < 2) {
      links.forEach(link => { if (!visited.has(link)) queue.push(link) })
    }
  }

  await browser.close()

  const topUrls = pages.slice(0, 5).map(p => p.url)
  const [mobileData, siteFiles] = await Promise.all([
    crawlMobile(startUrl, topUrls, screenshotDir).catch(err => {
      console.error(chalk.red(`[crawl] Mobile-Crawl fehlgeschlagen: ${err.message}`))
      return null
    }),
    siteFilesPromise,
  ])

  const geoData = await analyzeGeoSite(startUrl, geoPages, seoPages, siteFiles).catch(err => {
    console.error(chalk.red(`[crawl] GEO-Analyse fehlgeschlagen: ${err.message}`))
    return null
  })
  console.log(chalk.green(`[crawl] GEO-Score: ${geoData?.score ?? '–'}/100`))

  const manifest = { startUrl, crawledAt: new Date().toISOString(), hostname, reportId, pages, seoPages, geoData, mobileData }
  await writeFile('data/crawl_manifest.json', JSON.stringify(manifest, null, 2))
  console.log(chalk.green(`[crawl] Fertig. ${pages.length} Seiten gecrawlt.`))
  return manifest
}

// Direktaufruf: node scripts/crawl.js https://example.com
if (process.argv[2] && process.argv[2] !== '--self-test') {
  crawl(process.argv[2]).catch(err => {
    console.error(chalk.red(err.message))
    process.exit(1)
  })
}

// Self-Check für looksBotBlocked(): node scripts/crawl.js --self-test
// ponytail: kleinster sinnvoller Test für die Bot-Block-Branch-Logik,
// kein Testframework nötig für eine reine Wenn-Dann-Funktion.
if (process.argv[2] === '--self-test') {
  const assert = (cond, msg) => { if (!cond) throw new Error(`Self-Test fehlgeschlagen: ${msg}`) }
  assert(looksBotBlocked({ statusCode: 403, title: 'x' }) === true, '403 sollte als Block gelten')
  assert(looksBotBlocked({ statusCode: 429, title: 'x' }) === true, '429 sollte als Block gelten')
  assert(looksBotBlocked({ statusCode: 200, title: 'Just a moment...' }) === true, 'Cloudflare-Titel sollte als Block gelten')
  assert(looksBotBlocked({ statusCode: 200, title: 'Willkommen' }) === false, 'normale Seite sollte nicht blockiert sein')
  assert(looksBotBlocked({ statusCode: null, title: '' }) === false, 'Netzwerkfehler ohne Status ist kein Bot-Block')
  console.log(chalk.green('[crawl] Self-Test OK: looksBotBlocked()'))
}
