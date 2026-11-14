// links.js - extractLinks · filterLinks · guessPageType · fetchSitemapUrls
import { LINKS_EVAL_JS } from './browser/links-eval.js'

/**
 * Hostname, der für "dieselbe Website" zählt: ein führendes "www." wird
 * ignoriert. Sonst gilt jede Seite, die per 301 von www auf non-www (oder
 * umgekehrt) umleitet, als fremde Domain und der Crawl bleibt bei einer
 * einzigen Seite stehen.
 * @param {string} hostname
 * @returns {string}
 */
export function normalizeHost(hostname) {
  return (hostname || '').toLowerCase().replace(/^www\./, '')
}

/**
 * Extrahiert alle href-Links aus der aktuellen Seite via page.evaluate().
 * @param {import('playwright').Page} page
 * @returns {Promise<string[]>}
 */
export async function extractLinks(page) {
  try {
    return await page.evaluate(LINKS_EVAL_JS)
  } catch {
    return []
  }
}

/**
 * Filtert Links auf dieselbe Domain (www-tolerant), entfernt Duplikate und Anker.
 * @param {string[]} links
 * @param {string} baseUrl URL, gegen die gefiltert wird - idealerweise die
 *   finale URL nach Redirects (page.url()), nicht die Start-URL.
 * @returns {string[]}
 */
export function filterLinks(links, baseUrl) {
  try {
    const base = new URL(baseUrl)
    const baseHost = normalizeHost(base.hostname)
    const seen = new Set()
    return links
      .filter(href => {
        try {
          const url = new URL(href)
          return normalizeHost(url.hostname) === baseHost && !href.includes('#')
        } catch {
          return false
        }
      })
      .map(href => {
        const url = new URL(href)
        url.hash = ''
        url.search = ''
        return url.toString()
      })
      .filter(href => !seen.has(href) && seen.add(href))
  } catch {
    return []
  }
}

/**
 * Leitet den Seitentyp aus der URL ab.
 * @param {string} url
 * @returns {'home'|'contact'|'blog'|'product'|'legal'|'other'}
 */
export function guessPageType(url) {
  const path = new URL(url).pathname.toLowerCase()
  if (path === '/' || path === '/index' || path === '/index.html') return 'home'
  if (/contact|kontakt|ansprechpartner/.test(path)) return 'contact'
  if (/blog|news|artikel|beitrag/.test(path)) return 'blog'
  if (/product|produkt|shop|store|leistung/.test(path)) return 'product'
  if (/imprint|impressum|legal|datenschutz|privacy/.test(path)) return 'legal'
  return 'other'
}

const SITEMAP_TIMEOUT_MS = 5000
const SITEMAP_CHILD_LIMIT = 3

async function fetchText(url) {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(SITEMAP_TIMEOUT_MS),
      headers: { 'user-agent': 'WebsiteDoctor/1.x (+https://websitedoctor-api.runitfast.xyz)' },
    })
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  }
}

/** @param {string} xml @returns {string[]} */
function extractLocs(xml) {
  return [...xml.matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]]+?)\s*(?:\]\]>)?\s*<\/loc>/gi)]
    .map(m => m[1].trim())
    .filter(Boolean)
}

/**
 * Liest /sitemap.xml (bzw. /sitemap_index.xml) und gibt die enthaltenen
 * Seiten-URLs derselben Website zurück. Bei einem Sitemap-Index werden die
 * ersten Kind-Sitemaps nachgeladen. Liefert bei jedem Fehler eine leere Liste -
 * Discovery über sitemap.xml ist eine Ergänzung zum Link-Crawl, kein Muss.
 * @param {string} baseUrl
 * @param {number} limit
 * @returns {Promise<string[]>}
 */
export async function fetchSitemapUrls(baseUrl, limit = 20) {
  let base
  try {
    base = new URL(baseUrl)
  } catch {
    return []
  }
  const baseHost = normalizeHost(base.hostname)

  let locs = []
  for (const candidate of [`${base.origin}/sitemap.xml`, `${base.origin}/sitemap_index.xml`]) {
    const xml = await fetchText(candidate)
    if (!xml) continue
    const found = extractLocs(xml)
    if (found.length === 0) continue

    // Sitemap-Index: die <loc>s zeigen auf weitere Sitemaps
    const children = /<sitemapindex/i.test(xml)
      ? found.filter(l => /\.xml(\?|$)/i.test(l)).slice(0, SITEMAP_CHILD_LIMIT)
      : []
    if (children.length > 0) {
      const nested = await Promise.all(children.map(fetchText))
      locs = nested.filter(Boolean).flatMap(extractLocs)
    } else {
      locs = found
    }
    break
  }

  const seen = new Set()
  return locs
    .map(loc => {
      try {
        const url = new URL(loc)
        url.hash = ''
        return url
      } catch {
        return null
      }
    })
    .filter(url => url && normalizeHost(url.hostname) === baseHost)
    .map(url => url.toString())
    .filter(url => !seen.has(url) && seen.add(url))
    .slice(0, limit)
}
