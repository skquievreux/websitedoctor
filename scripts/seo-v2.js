// seo-v2.js – Erweiterte SEO-Checks (21 statt 11)
// Phase 2: Structured Data, OpenGraph, Twitter Cards, Lighthouse

// Detects unresloved i18n translation keys (e.g. "seo.homeTitle", "metaDescription")
const I18N_KEY_PATTERNS = [
  /^[a-z][a-zA-Z0-9]*(\.[a-zA-Z][a-zA-Z0-9]*)+$/,  // dot.notation.key
  /^[a-z][a-zA-Z]{2,}[A-Z][a-zA-Z0-9]+$/,            // camelCaseKey (no spaces)
]

function looksLikeI18nKey(str) {
  if (!str || str.length > 80) return false
  const trimmed = str.trim()
  if (trimmed.includes(' ')) return false  // real text has spaces
  return I18N_KEY_PATTERNS.some(p => p.test(trimmed))
}

const WEIGHTS = {
  // Original Checks (11)
  'title-present':           8,
  'title-length':            4,
  'meta-desc-present':       6,
  'meta-desc-length':        3,
  'h1-count':                8,
  'canonical':               6,
  'robots':                  8,
  'lang':                    3,
  'viewport':                5,
  'img-alt':                 8,
  'https':                   5,

  // Neue Checks (10)
  'structured-data':         8,    // JSON-LD
  'og-tags':                 6,    // OpenGraph
  'twitter-card':            4,    // Twitter
  'hreflang':                4,    // Multi-language
  'h2-hierarchy':            5,    // Content Structure
  'anchor-text':             4,    // Link Quality
  'internal-links':          5,    // Link Structure
  'images-optimized':        4,    // Image Quality
  'mobile-friendly':         6,    // Responsive
  'core-web-vitals':         7,    // LCP Performance
  'core-web-vitals-cls':     5,    // CLS (Cumulative Layout Shift)
  'content-ratio':           3,    // Content-to-HTML Ratio
}

const NON_INDEX_PATTERNS = [
  /\/login/, /\/logout/, /\/cart/, /\/checkout/,
  /\/thank/, /\/danke/, /\/admin/, /\/wp-admin/,
  /\/account/, /\/order-confirmation/, /\/warenkorb/,
]

function isIndexablePage(url) {
  return !NON_INDEX_PATTERNS.some(p => p.test(url))
}

/**
 * Erweiterte SEO-Analyse mit 21 Checks
 */
export async function analyzeSeoV2(page, url) {
  const indexable = isIndexablePage(url)

  const data = await page.evaluate(() => {
    // Original Data Collection
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

    // Neue Data Collection
    const jsonLds = document.querySelectorAll('script[type="application/ld+json"]')
    const ogTags = Array.from(document.querySelectorAll('meta[property^="og:"]'))
    const twitterTags = Array.from(document.querySelectorAll('meta[name^="twitter:"]'))
    const hreflangs = Array.from(document.querySelectorAll('link[rel="alternate"][hreflang]'))

    // Image Optimization Check
    const imgsWithoutAltSrcs = imgs
      .filter(i => !i.alt || i.alt.trim() === '')
      .map(i => { try { return new URL(i.src).pathname.split('/').pop() || i.src } catch { return i.src } })

    // Anchor Text Quality (zu viele "click here", "mehr", etc.)
    const genericAnchorTexts = ['click here', 'mehr', 'read more', 'learn more', 'hier', 'link']
    const linksWithGenericText = links.filter(l =>
      genericAnchorTexts.some(gt => (l.textContent?.toLowerCase() || '').includes(gt))
    ).length

    // Internal vs External Links
    const currentDomain = new URL(window.location.href).hostname
    const internalLinks = links.filter(l => {
      try {
        return new URL(l.href).hostname === currentDomain
      } catch { return false }
    }).length

    // H2/H3 Hierarchy Check
    const h2Count = h2Els.length
    const h3Count = h3Els.length

    // Core Web Vitals (Largest Contentful Paint - LCP)
    const perfObserver = window.performance?.getEntriesByType?.('largest-contentful-paint') || []
    const lcp = perfObserver.length > 0 ? perfObserver[perfObserver.length - 1]?.renderTime || 0 : 0

    // Core Web Vitals (Cumulative Layout Shift - CLS)
    const clsEntries = window.performance?.getEntriesByType?.('layout-shift') || []
    const cls = Math.round(
      clsEntries.reduce((s, e) => s + (e.hadRecentInput ? 0 : e.value), 0) * 1000
    ) / 1000

    // Content-to-HTML Ratio (Textanteil vs. gesamtes HTML)
    const htmlSize = document.documentElement?.outerHTML?.length || 0
    const textSize = document.body?.innerText?.length || 0
    const contentRatio = htmlSize > 0 ? Math.round((textSize / htmlSize) * 100) : 0

    // Mobile-Friendly Meta
    const mobileOptimized = viewport.includes('width=device-width')

    return {
      // Original
      titleText, metaDescText, canonical, robots, lang, viewport,
      h1Count: h1Els.length, h1Text: h1Els[0]?.textContent?.trim() || '',
      imgsWithoutAltSrcs, imgCount: imgs.length,

      // Neue Metriken
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
  }).catch(err => {
    console.error(`[seo-v2] page.evaluate failed for ${url}: ${err.message}`)
    // Return minimal data on error
    return {
      titleText: '', metaDescText: '', canonical: '', robots: '', lang: '', viewport: '',
      h1Count: 0, h1Text: '', imgsWithoutAltSrcs: [], imgCount: 0,
      hasJsonLd: false, jsonLdCount: 0, ogTagCount: 0, ogTags: [],
      twitterTagCount: 0, hasHreflang: false, hreflangs: [],
      linksWithGenericText: 0, linkCount: 0, internalLinks: 0,
      h2Count: 0, h3Count: 0, mobileOptimized: false, lcp: 0, cls: 0, contentRatio: 0,
    }
  })

  const tLen = data.titleText.length
  const mLen = data.metaDescText.length
  const titleIsI18nKey = looksLikeI18nKey(data.titleText)
  const metaIsI18nKey  = looksLikeI18nKey(data.metaDescText)

  // Gewichtete Checks
  const allIssues = [
    // i18n-Key-Check: muss vor title-present / meta-desc-present stehen
    ...(titleIsI18nKey ? [{
      id: 'i18n-title',
      label: `⚠ Title ist unaufgelöster i18n-Key: "${data.titleText}"`,
      pass: false,
      critical: true,
      weight: WEIGHTS['title-present'] + WEIGHTS['title-length'],
      value: data.titleText,
      suggestion: `Der Title "${data.titleText}" sieht aus wie ein nicht aufgelöster Übersetzungsschlüssel. Das eigentliche Problem ist eine kaputte i18n-/Internationalisierungs-Konfiguration — nicht eine zu kurze Zeichenlänge. Prüfe das i18n-Setup (z.B. react-i18next, vue-i18n, next-intl).`
    }] : []),
    ...(metaIsI18nKey ? [{
      id: 'i18n-meta-desc',
      label: `⚠ Meta-Description ist unaufgelöster i18n-Key: "${data.metaDescText}"`,
      pass: false,
      critical: true,
      weight: WEIGHTS['meta-desc-present'] + WEIGHTS['meta-desc-length'],
      value: data.metaDescText,
      suggestion: `Die Meta-Description "${data.metaDescText}" ist ein nicht aufgelöster Übersetzungsschlüssel. Prüfe das i18n-Setup.`
    }] : []),

    // ORIGINAL CHECKS (11)
    ...(!titleIsI18nKey ? [{
      id: 'title-present',
      label: `Title vorhanden (${tLen} Zeichen)`,
      pass: tLen > 0,
      weight: WEIGHTS['title-present'],
      value: data.titleText || null,
      suggestion: tLen === 0 ? 'Füge einen aussagekräftigen <title>-Tag hinzu' : null
    }] : []),
    ...(!titleIsI18nKey ? [{
      id: 'title-length',
      label: 'Title-Länge 50–60 Zeichen',
      pass: tLen >= 50 && tLen <= 60,
      weight: WEIGHTS['title-length'],
      value: data.titleText || null,
      suggestion: tLen > 0 && (tLen < 50 || tLen > 60)
        ? `Titel ist ${tLen} Zeichen. Ideal: 50–60 Zeichen`
        : null
    }] : []),
    ...(!metaIsI18nKey ? [{
      id: 'meta-desc-present',
      label: `Meta-Description vorhanden (${mLen} Zeichen)`,
      pass: mLen > 0,
      weight: WEIGHTS['meta-desc-present'],
      value: data.metaDescText || null,
      suggestion: mLen === 0 ? "Füge <meta name='description' content='...'> hinzu (120–160 Zeichen)" : null
    }] : []),
    ...(!metaIsI18nKey ? [{
      id: 'meta-desc-length',
      label: 'Meta-Description 120–160 Zeichen',
      pass: mLen >= 120 && mLen <= 160,
      weight: WEIGHTS['meta-desc-length'],
      value: data.metaDescText || null,
      suggestion: mLen > 0 && (mLen < 120 || mLen > 160)
        ? `Beschreibung ist ${mLen} Zeichen. Ideal: 120–160 Zeichen`
        : null
    }] : []),
    {
      id: 'h1-count',
      label: 'Genau ein H1',
      pass: data.h1Count === 1,
      weight: WEIGHTS['h1-count'],
      value: data.h1Text || null,
      suggestion: data.h1Count !== 1
        ? `${data.h1Count} H1 gefunden. Ideal: exakt 1`
        : null
    },
    {
      id: 'canonical',
      label: 'Canonical-Tag vorhanden',
      pass: data.canonical.length > 0,
      weight: WEIGHTS['canonical'],
      value: data.canonical || null,
      suggestion: !data.canonical ? `Füge <link rel='canonical' href='${url}'> hinzu` : null
    },
    {
      id: 'robots',
      label: 'Robots nicht noindex',
      pass: !data.robots.includes('noindex'),
      weight: WEIGHTS['robots'],
      value: data.robots || null,
      suggestion: data.robots.includes('noindex')
        ? "Entferne 'noindex' aus robots-Meta, wenn die Seite indexiert werden soll"
        : null
    },
    {
      id: 'lang',
      label: 'lang-Attribut gesetzt',
      pass: data.lang.length > 0,
      weight: WEIGHTS['lang'],
      value: data.lang || null,
      suggestion: !data.lang ? "Füge lang='de' (oder Sprache) zum <html>-Tag hinzu" : null
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
      label: `Alt-Text bei Bildern (${data.imgCount - data.imgsWithoutAltSrcs.length}/${data.imgCount})`,
      pass: data.imgsWithoutAltSrcs.length === 0,
      weight: WEIGHTS['img-alt'],
      value: data.imgsWithoutAltSrcs.length,
      suggestion: data.imgsWithoutAltSrcs.length > 0
        ? `${data.imgsWithoutAltSrcs.length} Bilder ohne alt-Text: ${data.imgsWithoutAltSrcs.slice(0, 2).join(', ')}${data.imgsWithoutAltSrcs.length > 2 ? '...' : ''}`
        : null
    },
    {
      id: 'https',
      label: 'HTTPS aktiviert',
      pass: url.startsWith('https://'),
      weight: WEIGHTS['https'],
      value: url,
      suggestion: !url.startsWith('https://') ? 'Aktiviere HTTPS/SSL auf deinem Server' : null
    },

    // NEUE CHECKS (10)
    {
      id: 'structured-data',
      label: `Structured Data (JSON-LD): ${data.jsonLdCount} vorhanden`,
      pass: data.hasJsonLd,
      weight: WEIGHTS['structured-data'],
      value: data.jsonLdCount,
      suggestion: !data.hasJsonLd
        ? 'Füge <script type="application/ld+json">...</script> mit Schema.org hinzu (Organization, LocalBusiness, Product, etc.)'
        : null
    },
    {
      id: 'og-tags',
      label: `OpenGraph Tags: ${data.ogTagCount} vorhanden`,
      pass: data.ogTagCount >= 4, // og:title, og:description, og:image, og:url
      weight: WEIGHTS['og-tags'],
      value: data.ogTagCount,
      suggestion: data.ogTagCount < 4
        ? `Mindestens 4 OpenGraph Tags erforderlich. Aktuell: ${data.ogTagCount}. Nutze: og:title, og:description, og:image, og:url`
        : null
    },
    {
      id: 'twitter-card',
      label: `Twitter Card: ${data.twitterTagCount} Tags`,
      pass: data.twitterTagCount >= 2,
      weight: WEIGHTS['twitter-card'],
      value: data.twitterTagCount,
      suggestion: data.twitterTagCount < 2
        ? 'Füge Twitter Card Tags hinzu: twitter:card, twitter:title, twitter:description, twitter:image'
        : null
    },
    {
      id: 'hreflang',
      label: `hreflang Tags: ${data.hreflangs.length} vorhanden`,
      pass: data.hasHreflang || url.includes('localhost'), // Skip für localhost
      weight: WEIGHTS['hreflang'],
      value: data.hreflangs.length,
      suggestion: !data.hasHreflang && !url.includes('localhost')
        ? 'Kein hreflang vorhanden. Nutze dies für mehrsprachige Websites: <link rel="alternate" hreflang="en" href="...">'
        : null
    },
    {
      id: 'h2-hierarchy',
      label: `Heading Hierarchy: ${data.h2Count} H2, ${data.h3Count} H3`,
      pass: data.h2Count > 0,
      weight: WEIGHTS['h2-hierarchy'],
      value: `H2: ${data.h2Count}, H3: ${data.h3Count}`,
      suggestion: data.h2Count === 0
        ? 'Keine H2-Überschriften vorhanden. Nutze H1 → H2 → H3 Hierarchie für bessere Struktur'
        : null
    },
    {
      id: 'anchor-text',
      label: `Link-Anchor-Text: ${data.linksWithGenericText} generisch`,
      pass: data.linksWithGenericText === 0,
      weight: WEIGHTS['anchor-text'],
      value: data.linksWithGenericText,
      suggestion: data.linksWithGenericText > 0
        ? `${data.linksWithGenericText} Links mit generischem Text ('click here', 'mehr', etc.). Nutze aussagekräftige Texte für besseres SEO`
        : null
    },
    {
      id: 'internal-links',
      label: `Interne Links: ${data.internalLinks} von ${data.linkCount}`,
      pass: data.internalLinks > 0,
      weight: WEIGHTS['internal-links'],
      value: data.internalLinks,
      suggestion: data.internalLinks === 0
        ? 'Keine internen Links vorhanden. Verlinke zwischen deinen Seiten für besseres SEO'
        : null
    },
    {
      id: 'images-optimized',
      label: `Bilder optimiert: ${data.imgCount - data.imgsWithoutAltSrcs.length}/${data.imgCount}`,
      pass: data.imgsWithoutAltSrcs.length === 0,
      weight: WEIGHTS['images-optimized'],
      value: `${data.imgCount} Bilder`,
      suggestion: data.imgsWithoutAltSrcs.length > 0
        ? `${data.imgsWithoutAltSrcs.length} Bilder ohne alt-Text. Nutze <img alt="Beschreibung"> für alle Bilder`
        : null
    },
    {
      id: 'mobile-friendly',
      label: 'Mobile-freundlich',
      pass: data.mobileOptimized,
      weight: WEIGHTS['mobile-friendly'],
      value: data.mobileOptimized,
      suggestion: !data.mobileOptimized
        ? "Füge <meta name='viewport' content='width=device-width, initial-scale=1'> hinzu"
        : null
    },
    {
      id: 'core-web-vitals',
      label: data.lcp > 0 ? `Core Web Vitals: LCP ${data.lcp}ms` : 'Core Web Vitals: LCP nicht messbar',
      pass: data.lcp > 0 && data.lcp < 2500,
      skipped: data.lcp === 0,
      weight: data.lcp === 0 ? 0 : WEIGHTS['core-web-vitals'],
      value: data.lcp > 0 ? `${data.lcp}ms LCP` : 'N/A',
      suggestion: data.lcp === 0
        ? 'LCP konnte nicht gemessen werden (SPA oder sehr schnelles Rendering). Manuell via Lighthouse prüfen.'
        : data.lcp >= 2500
          ? `Largest Contentful Paint ist ${data.lcp}ms. Ideal: < 2500ms. Optimiere Bilder und Server-Antwortzeit`
          : null
    },
    {
      id: 'core-web-vitals-cls',
      label: `Core Web Vitals: CLS ${data.cls}`,
      pass: data.cls < 0.1,
      skipped: data.cls === 0 && data.lcp === 0,
      weight: (data.cls === 0 && data.lcp === 0) ? 0 : WEIGHTS['core-web-vitals-cls'],
      value: data.cls,
      suggestion: data.cls >= 0.1
        ? `Cumulative Layout Shift ist ${data.cls} (Ziel: < 0.1). Reserviere Platz für Bilder und Ads mit width/height-Attributen oder aspect-ratio, um Layoutverschiebungen zu vermeiden.`
        : null
    },
    {
      id: 'content-ratio',
      label: `Content-to-HTML-Ratio: ${data.contentRatio}%`,
      pass: data.contentRatio >= 10,
      skipped: data.contentRatio === 0,
      weight: data.contentRatio === 0 ? 0 : WEIGHTS['content-ratio'],
      value: `${data.contentRatio}%`,
      suggestion: data.contentRatio > 0 && data.contentRatio < 10
        ? `Nur ${data.contentRatio}% der Seite sind echter Text. Der Rest ist HTML-Markup, Skripte oder Boilerplate. Prüfe ob Inhalte clientseitig gerendert werden oder zu viel Code inline ist.`
        : null
    },
  ]

  // Filter basierend auf Seiten-Typ
  // Auth- und Utility-Seiten brauchen keine H2-Hierarchie oder Social-Tags
  const skipForNonIndex = new Set([
    'canonical', 'h1-count', 'meta-desc-present', 'meta-desc-length',
    'h2-hierarchy', 'og-tags', 'twitter-card', 'hreflang', 'anchor-text',
  ])
  const issues = indexable
    ? allIssues
    : allIssues.filter(i => !skipForNonIndex.has(i.id))

  // Berechne Score
  const totalWeight = issues.reduce((sum, i) => sum + i.weight, 0)
  const passedWeight = issues.filter(i => i.pass).reduce((sum, i) => sum + i.weight, 0)
  const score = totalWeight > 0 ? Math.round((passedWeight / totalWeight) * 100) : 0

  return {
    url,
    title: data.titleText,
    description: data.metaDescText,
    indexable,
    score,
    checks: issues,
    metadata: {
      h1Count: data.h1Count,
      h2Count: data.h2Count,
      imageCount: data.imgCount,
      linkCount: data.linkCount,
      internalLinks: data.internalLinks,
      lcpMs: data.lcp,
      cls: data.cls,
      contentRatio: data.contentRatio,
    }
  }
}

function calcSeoScore(seoPages) {
  if (!seoPages.length) return { score: 0, pages: [] }
  let totalWeight = 0
  let earnedWeight = 0
  for (const p of seoPages) {
    if (!p.checks) continue
    for (const check of p.checks) {
      if (check.skipped) continue
      totalWeight += check.weight ?? 1
      if (check.pass) earnedWeight += check.weight ?? 1
    }
  }
  const score = totalWeight > 0 ? Math.round((earnedWeight / totalWeight) * 100) : 0
  return { score, pages: seoPages }
}

export { analyzeSeoV2 as analyzeSeo, calcSeoScore }
