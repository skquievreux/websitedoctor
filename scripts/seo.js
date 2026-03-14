// seo.js – SEO-Checks pro Seite (via page.evaluate)
// Basierend auf: seo-audit skill + addyosmani/web-quality-skills@seo

/**
 * Führt alle SEO-Checks für eine bereits geladene Seite durch.
 * @param {import('playwright').Page} page
 * @param {string} url
 * @returns {Promise<{ url, issues: Array<{label, pass}> }>}
 */
export async function analyzeSeo(page, url) {
  const data = await page.evaluate(() => {
    const title = document.title || ''
    const metaDesc = document.querySelector('meta[name="description"]')?.content || ''
    const canonical = document.querySelector('link[rel="canonical"]')?.href || ''
    const robots = document.querySelector('meta[name="robots"]')?.content || ''
    const lang = document.documentElement.lang || ''
    const viewport = document.querySelector('meta[name="viewport"]')?.content || ''
    const h1s = document.querySelectorAll('h1').length
    const h2s = document.querySelectorAll('h2').length
    const imgs = Array.from(document.querySelectorAll('img'))
    const imgsWithoutAlt = imgs.filter(i => !i.alt || i.alt.trim() === '').length

    return { title, metaDesc, canonical, robots, lang, viewport, h1s, h2s, imgsWithoutAlt, imgCount: imgs.length }
  })

  const issues = [
    { label: `Title vorhanden (${data.title.length} Zeichen)`, pass: data.title.length > 0 },
    { label: `Title-Länge 50–60 Zeichen`, pass: data.title.length >= 50 && data.title.length <= 60 },
    { label: `Meta-Description vorhanden (${data.metaDesc.length} Zeichen)`, pass: data.metaDesc.length > 0 },
    { label: `Meta-Description 150–160 Zeichen`, pass: data.metaDesc.length >= 150 && data.metaDesc.length <= 160 },
    { label: `Genau ein H1`, pass: data.h1s === 1 },
    { label: `Canonical-Tag vorhanden`, pass: data.canonical.length > 0 },
    { label: `Robots nicht noindex`, pass: !data.robots.includes('noindex') },
    { label: `lang-Attribut gesetzt`, pass: data.lang.length > 0 },
    { label: `Viewport-Meta vorhanden`, pass: data.viewport.includes('width=device-width') },
    { label: `Alle Bilder haben Alt-Text (${data.imgsWithoutAlt} ohne)`, pass: data.imgsWithoutAlt === 0 },
    { label: `HTTPS`, pass: url.startsWith('https://') },
  ]

  return { url, issues }
}

/**
 * Berechnet den SEO-Score aus allen Seiten-Analysen.
 * @param {Array<{ url, issues }>} seoPages
 * @returns {{ score: number, pages: Array }}
 */
export function calcSeoScore(seoPages) {
  if (!seoPages.length) return { score: 0, pages: [] }
  const total = seoPages.reduce((sum, p) => sum + p.issues.length, 0)
  const passed = seoPages.reduce((sum, p) => sum + p.issues.filter(i => i.pass).length, 0)
  const score = Math.round((passed / total) * 100)
  return { score, pages: seoPages }
}
