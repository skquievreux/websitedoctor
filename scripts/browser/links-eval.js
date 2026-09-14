// links-eval.js – in-page link extraction for scripts/links.js.
// Same IIFE-string trick as seo-eval.js: shared verbatim between the
// Playwright crawl and the Scrapling/Camoufox fallback.
export const LINKS_EVAL_JS = `(() =>
  Array.from(document.querySelectorAll('a[href]'))
    .map(a => a.href)
    .filter(href => href.startsWith('http'))
)()`
