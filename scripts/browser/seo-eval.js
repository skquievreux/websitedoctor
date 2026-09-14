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

  // Mixed Content: http:// resources loaded on an https:// page (browsers
  // block/warn on these, and it defeats the point of HTTPS).
  const isHttps = window.location.protocol === 'https:'
  const mixedContentUrls = isHttps
    ? Array.from(document.querySelectorAll('img[src], script[src], link[href], iframe[src]'))
        .map(el => el.src || el.href || '')
        .filter(src => src.startsWith('http://'))
    : []

  // Total Blocking Time approximation (synthetic proxy for INP, which needs
  // real user interaction we don't have in an automated crawl). Chrome
  // buffers 'longtask' entries the same way it buffers LCP/CLS above, so
  // this is retrievable after load, not just via a live PerformanceObserver.
  const longTasks = window.performance?.getEntriesByType?.('longtask') || []
  const tbt = Math.round(longTasks.reduce((sum, t) => sum + Math.max(0, t.duration - 50), 0))

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
    mixedContentCount: mixedContentUrls.length,
    mixedContentUrls: mixedContentUrls.slice(0, 5),
    tbt,
  }
})()`
