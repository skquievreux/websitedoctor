// seo.js – SEO-Checks pro Seite (via page.evaluate)
// v2.0: B1 Gewichteter Score, B2 Seiten-Kontext (nicht-indexierbar)

// B1 — Gewichtungstabelle (Summe = 100)
const WEIGHTS = {
  'title-present':     15,
  'title-length':       5,
  'meta-desc-present': 10,
  'meta-desc-length':   3,
  'h1-count':          12,
  'canonical':         10,
  'robots':            15,
  'lang':               5,
  'viewport':           8,
  'img-alt':           10,
  'https':              7,
}

// B2 — Nicht-indexierbare URLs: bestimmte Checks überspringen
const NON_INDEX_PATTERNS = [
  /\/login/, /\/logout/, /\/cart/, /\/checkout/,
  /\/thank/, /\/danke/, /\/admin/, /\/wp-admin/,
  /\/account/, /\/order-confirmation/, /\/warenkorb/,
]

function isIndexablePage(url) {
  return !NON_INDEX_PATTERNS.some(p => p.test(url))
}

/**
 * @param {import('playwright').Page} page
 * @param {string} url
 * @returns {Promise<{ url, metaDescription, pageTitle, indexable, issues }>}
 */
export async function analyzeSeo(page, url) {
  const indexable = isIndexablePage(url)

  const data = await page.evaluate(() => {
    const titleText = document.title || ''
    const metaDescText = document.querySelector('meta[name="description"]')?.content || ''
    const canonical = document.querySelector('link[rel="canonical"]')?.href || ''
    const robots = document.querySelector('meta[name="robots"]')?.content || ''
    const lang = document.documentElement.lang || ''
    const viewport = document.querySelector('meta[name="viewport"]')?.content || ''
    const h1Els = Array.from(document.querySelectorAll('h1'))
    const h1Text = h1Els[0]?.textContent?.trim() || ''
    const h2Texts = Array.from(document.querySelectorAll('h2')).map(el => el.textContent?.trim())
    const imgs = Array.from(document.querySelectorAll('img'))
    const imgsWithoutAltSrcs = imgs
      .filter(i => !i.alt || i.alt.trim() === '')
      .map(i => { try { return new URL(i.src).pathname.split('/').pop() || i.src } catch { return i.src } })
    return { titleText, metaDescText, canonical, robots, lang, viewport,
             h1Count: h1Els.length, h1Text, h2Texts, imgsWithoutAltSrcs, imgCount: imgs.length }
  })

  const tLen = data.titleText.length
  const mLen = data.metaDescText.length

  // B2 — Checks die bei nicht-indexierbaren Seiten übersprungen werden
  const skipForNonIndex = new Set(['canonical', 'h1-count', 'meta-desc-present', 'meta-desc-length'])

  const allIssues = [
    {
      id: 'title-present',
      label: `Title vorhanden (${tLen} Zeichen)`,
      pass: tLen > 0,
      weight: WEIGHTS['title-present'],
      value: data.titleText || null,
      suggestion: tLen === 0 ? 'Füge einen aussagekräftigen <title>-Tag hinzu' : null
    },
    {
      id: 'title-length',
      label: 'Title-Länge 50–60 Zeichen',
      pass: tLen >= 50 && tLen <= 60,
      weight: WEIGHTS['title-length'],
      value: data.titleText || null,
      suggestion: tLen > 0 && tLen < 50
        ? `Titel '${data.titleText}' ist ${tLen} Zeichen kurz. Füge Keywords hinzu bis 50–60 Zeichen`
        : tLen > 60
          ? `Titel '${data.titleText.slice(0, 40)}…' ist ${tLen} Zeichen. Kürze auf max. 60 Zeichen`
          : null
    },
    {
      id: 'meta-desc-present',
      label: `Meta-Description vorhanden (${mLen} Zeichen)`,
      pass: mLen > 0,
      weight: WEIGHTS['meta-desc-present'],
      value: data.metaDescText || null,
      suggestion: mLen === 0 ? "Füge <meta name='description' content='...'> hinzu (150–160 Zeichen)" : null
    },
    {
      id: 'meta-desc-length',
      label: 'Meta-Description 150–160 Zeichen',
      pass: mLen >= 150 && mLen <= 160,
      weight: WEIGHTS['meta-desc-length'],
      value: data.metaDescText || null,
      suggestion: mLen > 0 && mLen < 150
        ? `Beschreibung '${data.metaDescText.slice(0, 40)}…' ist ${mLen} Zeichen. Ergänze auf 150–160 Zeichen`
        : mLen > 160
          ? `Beschreibung '${data.metaDescText.slice(0, 40)}…' ist ${mLen} Zeichen. Kürze auf max. 160 Zeichen`
          : null
    },
    {
      id: 'h1-count',
      label: 'Genau ein H1',
      pass: data.h1Count === 1,
      weight: WEIGHTS['h1-count'],
      value: data.h1Text || null,
      suggestion: data.h1Count === 0
        ? 'Kein <h1> gefunden. Füge eine Hauptüberschrift hinzu'
        : data.h1Count > 1
          ? `${data.h1Count} <h1>-Tags gefunden. Behalte nur einen`
          : null
    },
    {
      id: 'canonical',
      label: 'Canonical-Tag vorhanden',
      pass: data.canonical.length > 0,
      weight: WEIGHTS['canonical'],
      value: data.canonical || null,
      suggestion: !data.canonical ? `Füge <link rel='canonical' href='${url}'> zum <head> hinzu` : null
    },
    {
      id: 'robots',
      label: 'Robots nicht noindex',
      pass: !data.robots.includes('noindex'),
      weight: WEIGHTS['robots'],
      value: data.robots || null,
      suggestion: data.robots.includes('noindex')
        ? "Robots-Meta enthält 'noindex'. Entferne dies, wenn die Seite indexiert werden soll"
        : null
    },
    {
      id: 'lang',
      label: 'lang-Attribut gesetzt',
      pass: data.lang.length > 0,
      weight: WEIGHTS['lang'],
      value: data.lang || null,
      suggestion: !data.lang ? "Füge lang='de' (oder passende Sprache) zum <html>-Tag hinzu" : null
    },
    {
      id: 'viewport',
      label: 'Viewport-Meta vorhanden',
      pass: data.viewport.includes('width=device-width'),
      weight: WEIGHTS['viewport'],
      value: data.viewport || null,
      suggestion: !data.viewport.includes('width=device-width')
        ? "Füge <meta name='viewport' content='width=device-width, initial-scale=1'> hinzu"
        : null
    },
    {
      id: 'img-alt',
      label: `Alle Bilder haben Alt-Text (${data.imgsWithoutAltSrcs.length} ohne)`,
      pass: data.imgsWithoutAltSrcs.length === 0,
      weight: WEIGHTS['img-alt'],
      value: data.imgsWithoutAltSrcs.length > 0 ? data.imgsWithoutAltSrcs.slice(0, 5).join(', ') : null,
      suggestion: data.imgsWithoutAltSrcs.length > 0
        ? `${data.imgsWithoutAltSrcs.length} Bilder ohne alt-Text: ${data.imgsWithoutAltSrcs.slice(0, 3).join(', ')}. Beschreibe den Bildinhalt`
        : null
    },
    {
      id: 'https',
      label: 'HTTPS',
      pass: url.startsWith('https://'),
      weight: WEIGHTS['https'],
      value: url.startsWith('https://') ? 'https' : 'http',
      suggestion: !url.startsWith('https://') ? 'Wechsle zu HTTPS für Sicherheit und besseres SEO-Ranking' : null
    },
  ]

  // B2 — Nicht-indexierbare Seiten: bestimmte Checks als skipped markieren
  const issues = allIssues.map(issue => {
    if (!indexable && skipForNonIndex.has(issue.id)) {
      return { ...issue, pass: true, skipped: true, suggestion: null }
    }
    return issue
  })

  return {
    url,
    indexable,
    metaDescription: data.metaDescText || null,
    pageTitle: data.titleText || null,
    issues
  }
}

/**
 * B1 — Gewichteter SEO-Score
 * @param {Array<{ url, issues }>} seoPages
 * @returns {{ score: number, pages: Array }}
 */
export function calcSeoScore(seoPages) {
  if (!seoPages.length) return { score: 0, pages: [] }

  let totalWeight = 0
  let earnedWeight = 0

  for (const p of seoPages) {
    for (const issue of p.issues) {
      if (issue.skipped) continue   // übersprungene Checks nicht werten
      totalWeight += issue.weight ?? 1
      if (issue.pass) earnedWeight += issue.weight ?? 1
    }
  }

  const score = totalWeight > 0 ? Math.round((earnedWeight / totalWeight) * 100) : 0
  return { score, pages: seoPages }
}
