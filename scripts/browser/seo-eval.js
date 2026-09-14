// seo-eval.js – in-page data collection for analyzeSeoV2 (scripts/seo-v2.js).
// Kept as a standalone IIFE-expression string (not an ES module) so both
// Playwright (Node, page.evaluate(string)) and the Scrapling/Camoufox
// fallback (Python, page.evaluate(string)) can run the exact same check
// logic without duplicating it in two languages.
export const SEO_EVAL_JS = `(() => {
  const titleText = document.title || ''
  const metaDescText = document.querySelector('meta[name="description"]')?.content || ''
  const canonical = document.querySelector('link[rel="canonical"]')?.href || ''
  const robots = document.querySelector('meta[name="robots"]')?.content || ''
  const lang = document.documentElement.lang || ''
  const viewport = document.querySelector('meta[name="viewport"]')?.content || ''
  const h1Els = Array.from(document.querySelectorAll('h1'))
  const h2Els = Array.from(document.querySelectorAll('h2'))
  const h3Els = Array.from(document.querySelectorAll('h3'))
  const imgs = Array.from(document.querySelectorAll('img'))
  const links = Array.from(document.querySelectorAll('a[href]'))

  const jsonLds = document.querySelectorAll('script[type="application/ld+json"]')
  const ogTags = Array.from(document.querySelectorAll('meta[property^="og:"]'))
  const twitterTags = Array.from(document.querySelectorAll('meta[name^="twitter:"]'))
  const hreflangs = Array.from(document.querySelectorAll('link[rel="alternate"][hreflang]'))

  const imgsWithoutAltSrcs = imgs
    .filter(i => !i.alt || i.alt.trim() === '')
    .map(i => { try { return new URL(i.src).pathname.split('/').pop() || i.src } catch { return i.src } })

  const genericAnchorTexts = ['click here', 'mehr', 'read more', 'learn more', 'hier', 'link']
  const linksWithGenericText = links.filter(l =>
    genericAnchorTexts.some(gt => (l.textContent?.toLowerCase() || '').includes(gt))
  ).length

  const currentDomain = new URL(window.location.href).hostname
  const internalLinks = links.filter(l => {
    try { return new URL(l.href).hostname === currentDomain } catch { return false }
  }).length

  const h2Count = h2Els.length
  const h3Count = h3Els.length

  const perfObserver = window.performance?.getEntriesByType?.('largest-contentful-paint') || []
  const lcp = perfObserver.length > 0 ? perfObserver[perfObserver.length - 1]?.renderTime || 0 : 0

  const clsEntries = window.performance?.getEntriesByType?.('layout-shift') || []
  const cls = Math.round(
    clsEntries.reduce((s, e) => s + (e.hadRecentInput ? 0 : e.value), 0) * 1000
  ) / 1000

  const htmlSize = document.documentElement?.outerHTML?.length || 0
  const textSize = document.body?.innerText?.length || 0
  const contentRatio = htmlSize > 0 ? Math.round((textSize / htmlSize) * 100) : 0

  const mobileOptimized = viewport.includes('width=device-width')

  return {
    titleText, metaDescText, canonical, robots, lang, viewport,
    h1Count: h1Els.length, h1Text: h1Els[0]?.textContent?.trim() || '',
    imgsWithoutAltSrcs, imgCount: imgs.length,
    hasJsonLd: jsonLds.length > 0,
    jsonLdCount: jsonLds.length,
    ogTagCount: ogTags.length,
    ogTags: ogTags.map(t => ({ property: t.getAttribute('property'), content: t.getAttribute('content') })),
    twitterTagCount: twitterTags.length,
    hasHreflang: hreflangs.length > 0,
    hreflangs: hreflangs.map(h => ({ rel: h.getAttribute('hreflang'), href: h.getAttribute('href') })),
    linksWithGenericText,
    linkCount: links.length,
    internalLinks,
    h2Count, h3Count,
    mobileOptimized,
    lcp: Math.round(lcp),
    cls,
    contentRatio,
  }
})()`
