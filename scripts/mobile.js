// mobile.js – Mobile-Crawl mit iPhone-Emulation
import { chromium, devices } from 'playwright'
import { mkdir } from 'fs/promises'
import path from 'path'
import chalk from 'chalk'

const TIMEOUT = 10000
const MOBILE_DEVICE = devices['iPhone 13']

function slugify(url) {
  return url.replace(/https?:\/\//, '').replace(/[^a-z0-9]/gi, '-').slice(0, 80)
}

async function takeMobileScreenshot(page, url, screenshotDir) {
  const filename = `mobile-${slugify(url)}.png`
  const filepath = path.join(screenshotDir, filename)
  try {
    await page.screenshot({ path: filepath, fullPage: false })
    return filepath.replace(/\\/g, '/') // Forward-Slashes für URLs
  } catch {
    return null
  }
}

async function checkMobilePage(page, url, screenshotDir) {
  const start = Date.now()
  let statusCode = null
  try {
    const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT })
    statusCode = res?.status() ?? null
  } catch (err) {
    console.error(chalk.red(`[mobile] Fehler bei ${url}: ${err.message}`))
  }
  const loadTime = Date.now() - start
  const title = await page.title().catch(() => '')
  const screenshotPath = await takeMobileScreenshot(page, url, screenshotDir)
  return { url, title, statusCode, loadTime, screenshotPath }
}

async function runMobileChecks(page) {
  const results = await page.evaluate(() => {
    const viewport = document.querySelector('meta[name="viewport"]')?.content || ''
    const hasViewport = viewport.includes('width=device-width')
    const hasHorizScroll = document.documentElement.scrollWidth > document.documentElement.clientWidth

    const bodyStyle = window.getComputedStyle(document.body)
    const fontSize = parseFloat(bodyStyle.fontSize) || 0
    const fontOk = fontSize >= 14

    const tapTargets = Array.from(document.querySelectorAll('a, button'))
    const smallTargets = tapTargets.filter(el => {
      const r = el.getBoundingClientRect()
      return r.width > 0 && r.height > 0 && (r.width < 44 || r.height < 44)
    }).length

    return { hasViewport, hasHorizScroll, fontOk, fontSize, smallTargets, tapTotal: tapTargets.length }
  })

  return [
    { label: 'Viewport-Meta korrekt (width=device-width)', pass: results.hasViewport },
    { label: 'Kein horizontales Scrollen', pass: !results.hasHorizScroll },
    { label: `Schriftgröße ≥ 14px (${Math.round(results.fontSize)}px)`, pass: results.fontOk },
    { label: `Tap-Targets ausreichend groß (${results.smallTargets} zu klein von ${results.tapTotal})`, pass: results.smallTargets === 0 },
  ]
}

export async function crawlMobile(startUrl, urlsToCrawl, screenshotDir = 'screenshots') {
  await mkdir(screenshotDir, { recursive: true })

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ ...MOBILE_DEVICE })
  const page = await context.newPage()

  console.log(chalk.blue(`[mobile] Start iPhone 13 Emulation: ${startUrl}`))

  const urls = urlsToCrawl?.length ? urlsToCrawl.slice(0, 5) : [startUrl]
  const pages = []
  const allChecks = []

  for (const url of urls) {
    console.log(chalk.gray(`[mobile] Prüfe: ${url}`))
    const pageData = await checkMobilePage(page, url, screenshotDir)
    const checks = await runMobileChecks(page).catch(() => [])
    pages.push(pageData)
    allChecks.push(...checks)
  }

  await browser.close()

  const aggregated = aggregateChecks(allChecks)
  const passed = aggregated.filter(c => c.pass).length
  const score = Math.round((passed / (aggregated.length || 1)) * 100)

  console.log(chalk.green(`[mobile] Fertig. Mobile-Score: ${score}/100`))
  return { score, checks: aggregated, pages }
}

function aggregateChecks(checks) {
  const map = new Map()
  for (const c of checks) {
    const key = c.label.replace(/\(.*\)/, '').trim()
    if (!map.has(key)) map.set(key, { ...c })
    else if (!c.pass) map.get(key).pass = false
  }
  return Array.from(map.values())
}
