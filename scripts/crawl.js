// crawl.js – Playwright Loop · Seiten besuchen · Screenshots · SEO
import { chromium } from 'playwright'
import { writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import chalk from 'chalk'
import { extractLinks, filterLinks, guessPageType } from './links.js'
import { analyzeSeo } from './seo.js'
import { crawlMobile } from './mobile.js'

const MAX_PAGES = 20
const TIMEOUT = 10000
const SCREENSHOT_DIR = 'screenshots'

function slugify(url) {
  return url.replace(/https?:\/\//, '').replace(/[^a-z0-9]/gi, '-').slice(0, 80)
}

async function takeScreenshot(page, url, prefix = '') {
  const filename = `${prefix}${slugify(url)}.png`
  const filepath = path.join(SCREENSHOT_DIR, filename)
  try {
    await page.screenshot({ path: filepath, fullPage: true })
    return filepath
  } catch {
    return null
  }
}

async function visitPage(page, url) {
  const start = Date.now()
  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT })
    const loadTime = Date.now() - start
    const statusCode = response?.status() ?? null
    const title = await page.title().catch(() => '')
    return { statusCode, title, loadTime }
  } catch (err) {
    console.error(chalk.red(`[crawl] Fehler bei ${url}: ${err.message}`))
    return { statusCode: null, title: '', loadTime: null }
  }
}

export async function crawl(startUrl, onProgress) {
  if (!existsSync(SCREENSHOT_DIR)) await mkdir(SCREENSHOT_DIR, { recursive: true })

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext()
  const page = await context.newPage()

  const visited = new Set()
  const queue = [startUrl]
  const pages = []
  const seoPages = []

  console.log(chalk.blue(`[crawl] Start: ${startUrl}`))

  while (queue.length > 0 && visited.size < MAX_PAGES) {
    const url = queue.shift()
    if (visited.has(url)) continue
    visited.add(url)

    console.log(chalk.gray(`[crawl] Besuche (${visited.size}/${MAX_PAGES}): ${url}`))
    onProgress?.({ current: visited.size, max: MAX_PAGES, url })

    const { statusCode, title, loadTime } = await visitPage(page, url)
    const screenshotPath = await takeScreenshot(page, url)
    const seoResult = await analyzeSeo(page, url)
    const rawLinks = await extractLinks(page)
    const links = filterLinks(rawLinks, startUrl)
    const type = guessPageType(url)

    pages.push({ url, statusCode, title, type, screenshotPath, links, loadTime })
    seoPages.push(seoResult)

    if (visited.size < 2) {
      links.forEach(link => { if (!visited.has(link)) queue.push(link) })
    }
  }

  await browser.close()

  // Mobile-Crawl auf den ersten 5 gecrawlten URLs
  const topUrls = pages.slice(0, 5).map(p => p.url)
  const mobileData = await crawlMobile(startUrl, topUrls).catch(err => {
    console.error(chalk.red(`[crawl] Mobile-Crawl fehlgeschlagen: ${err.message}`))
    return null
  })

  const manifest = { startUrl, crawledAt: new Date().toISOString(), pages, seoPages, mobileData }
  await writeFile('crawl_manifest.json', JSON.stringify(manifest, null, 2))
  console.log(chalk.green(`[crawl] Fertig. ${pages.length} Seiten gecrawlt.`))
  return manifest
}

// Direktaufruf: node scripts/crawl.js https://example.com
if (process.argv[2]) {
  crawl(process.argv[2]).catch(err => {
    console.error(chalk.red(err.message))
    process.exit(1)
  })
}
