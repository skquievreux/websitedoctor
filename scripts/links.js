// links.js – extractLinks · filterLinks · guessPageType

/**
 * Extrahiert alle href-Links aus der aktuellen Seite via page.evaluate().
 * @param {import('playwright').Page} page
 * @returns {Promise<string[]>}
 */
export async function extractLinks(page) {
  try {
    return await page.evaluate(() =>
      Array.from(document.querySelectorAll('a[href]'))
        .map(a => a.href)
        .filter(href => href.startsWith('http'))
    )
  } catch {
    return []
  }
}

/**
 * Filtert Links auf dieselbe Domain, entfernt Duplikate und Anker.
 * @param {string[]} links
 * @param {string} baseUrl
 * @returns {string[]}
 */
export function filterLinks(links, baseUrl) {
  try {
    const base = new URL(baseUrl)
    const seen = new Set()
    return links
      .filter(href => {
        try {
          const url = new URL(href)
          return url.hostname === base.hostname && !href.includes('#')
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
