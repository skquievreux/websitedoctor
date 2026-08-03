// geo.js – GEO (Generative Engine Optimization) Checks
// Bewertet wie gut eine Website von LLMs (ChatGPT, Perplexity, Claude) gelesen werden kann

// Score-Gewichte (normalisiert, Summe irrelevant)
const WEIGHTS = {
  'sitemap-exists':      10,
  'json-ld-specific':    20,
  'entity-links':        15,
  'qa-structure':        15,
  'structured-clusters': 10,
  'ai-bots-allowed':     15,
  'unique-meta':         15,
  'anchor-text-quality': 10,
}

const SPECIFIC_SCHEMA_TYPES = [
  'Product', 'Service', 'LocalBusiness', 'Organization', 'Person',
  'Article', 'NewsArticle', 'BlogPosting', 'TechArticle', 'FAQPage',
  'HowTo', 'Recipe', 'Event', 'JobPosting', 'Course', 'Review',
  'SoftwareApplication', 'MedicalEntity', 'Book', 'CreativeWork',
]

const AI_BOTS = [
  { name: 'GPTBot',          owner: 'OpenAI / ChatGPT' },
  { name: 'ClaudeBot',       owner: 'Anthropic / Claude' },
  { name: 'anthropic-ai',    owner: 'Anthropic' },
  { name: 'Google-Extended', owner: 'Google / Gemini' },
  { name: 'PerplexityBot',   owner: 'Perplexity' },
  { name: 'CCBot',           owner: 'Common Crawl (AI Training)' },
  { name: 'FacebookBot',     owner: 'Meta AI' },
]

const GENERIC_ANCHORS = [
  'click here', 'mehr', 'read more', 'learn more', 'hier', 'link',
  'weiter', 'mehr erfahren', 'jetzt', 'hier klicken', 'more', 'weiterlesen',
  'details', 'info', 'klicken', 'öffnen',
]

const QUESTION_WORDS = [
  'was', 'wie', 'warum', 'wann', 'wer', 'wo', 'welche', 'welcher', 'welches',
  'what', 'how', 'why', 'when', 'who', 'where', 'which',
]

// ── Per-Page Analyse ──────────────────────────────────────────────────────────
export async function analyzeGeoPage(page, url) {
  const data = await page.evaluate((qWords, genericTexts) => {
    // JSON-LD parsen
    const parsedLds = []
    document.querySelectorAll('script[type="application/ld+json"]').forEach(el => {
      try { parsedLds.push(JSON.parse(el.textContent)) } catch { /* invalid JSON-LD – skip */ }
    })

    // Schema-Typen extrahieren (inkl. @graph)
    const schemaTypes = parsedLds.flatMap(ld => {
      const types = []
      const extract = (obj) => {
        if (!obj || typeof obj !== 'object') return
        if (obj['@type']) types.push(...(Array.isArray(obj['@type']) ? obj['@type'] : [obj['@type']]))
        if (Array.isArray(obj['@graph'])) obj['@graph'].forEach(extract)
      }
      extract(ld)
      return types
    })

    // Entitäts-Verknüpfungen (sameAs, about, mentions → Wikidata/Wikipedia)
    const entityLinks = []
    const extractLinks = (obj, depth = 0) => {
      if (depth > 4 || !obj || typeof obj !== 'object') return
      for (const key of ['sameAs', 'about', 'mentions']) {
        const val = obj[key]
        if (!val) continue
        const vals = Array.isArray(val) ? val : [val]
        vals.forEach(v => {
          const href = typeof v === 'string' ? v : v?.['@id'] || v?.url || ''
          if (href && (href.includes('wikidata.org') || href.includes('wikipedia.org') || href.includes('dbpedia.org'))) {
            entityLinks.push({ prop: key, url: href })
          }
        })
      }
      Object.values(obj).forEach(v => extractLinks(v, depth + 1))
    }
    parsedLds.forEach(ld => extractLinks(ld))

    // Q&A-Struktur: H2/H3 als Frage → kurzer P-Antwort-Abschnitt
    let qaCount = 0
    const qaExamples = []
    document.querySelectorAll('h2, h3').forEach(h => {
      const text = h.textContent?.trim() || ''
      const lc = text.toLowerCase()
      const isQuestion = qWords.some(w => lc.startsWith(w + ' ') || lc.startsWith(w + ',')) || text.endsWith('?')
      if (!isQuestion) return
      let next = h.nextElementSibling
      while (next && !['P', 'H1', 'H2', 'H3', 'H4'].includes(next.tagName)) next = next.nextElementSibling
      if (next?.tagName === 'P') {
        const len = next.textContent?.trim().length || 0
        if (len >= 80 && len <= 400) {
          qaCount++
          if (qaExamples.length < 3) qaExamples.push({ q: text.slice(0, 80), a: next.textContent?.trim().slice(0, 120) })
        }
      }
    })

    // Strukturierte Inhalte
    const bodyText = document.body?.innerText || ''
    const wordCount = bodyText.split(/\s+/).filter(Boolean).length
    const tableCount = document.querySelectorAll('table').length
    const listCount  = document.querySelectorAll('ul, ol').length

    // Faktendichte — erweitertes Muster: Einheiten, Preise, Jahreszahlen, Mengenangaben
    const factMatches = bodyText.match(
      /\b\d+([.,]\d+)?\s*(%|Prozent|kg|km|ms|MB|GB|TB|USD|EUR|€|\$|mph|km\/h|Mio\.|Tsd\.)|[€$]\s*\d+([.,]\d+)?|\b(19|20)\d{2}\b|\b\d{4,}\b|\b\d+([.,]\d+)?\s*(Minuten|Stunden|Tage|Jahre|Sekunden|Wochen|Monate|Nutzer|Kunden|Seiten|Klicks)/g
    ) || []
    const factCount = factMatches.length
    // null = nicht messbar (kein Inhalt oder rein JS-gerendert)
    const factDensity = wordCount > 200
      ? (factCount > 0 ? Math.round((factCount / wordCount) * 1000) : null)
      : (wordCount > 0 ? Math.round((factCount / wordCount) * 1000) : null)

    // Ankertexte
    const links = Array.from(document.querySelectorAll('a[href]'))
    const genericCount = links.filter(l =>
      genericTexts.some(g => (l.textContent?.toLowerCase().trim() || '') === g ||
        (l.textContent?.toLowerCase().trim() || '').includes(g))
    ).length
    const genericRatio = links.length > 0 ? genericCount / links.length : 0

    // LLM-Snippet: erster <p> nach H1
    let snippetPreview = ''
    const h1 = document.querySelector('h1')
    if (h1) {
      let next = h1.nextElementSibling
      while (next && next.tagName !== 'P') next = next.nextElementSibling
      snippetPreview = next?.textContent?.trim().slice(0, 300) || ''
    }

    return {
      schemaTypes,
      entityLinks,
      qaCount,
      qaExamples,
      wordCount,
      tableCount,
      listCount,
      structuredCount: tableCount + listCount,
      factDensity,
      factCount,
      totalLinks: links.length,
      genericLinks: genericCount,
      genericRatio,
      snippetPreview,
      hasJsonLd: parsedLds.length > 0,
      jsonLdCount: parsedLds.length,
    }
  }, QUESTION_WORDS, GENERIC_ANCHORS).catch(() => ({
    schemaTypes: [], entityLinks: [], qaCount: 0, qaExamples: [], wordCount: 0,
    tableCount: 0, listCount: 0, structuredCount: 0, factDensity: 0, factCount: 0,
    totalLinks: 0, genericLinks: 0, genericRatio: 0, snippetPreview: '',
    hasJsonLd: false, jsonLdCount: 0,
  }))

  return { url, ...data }
}

// ── Site-Level Analyse (nach dem Crawl-Loop) ─────────────────────────────────
export async function analyzeGeoSite(startUrl, geoPages, seoPages, siteFiles) {
  const { robotsTxt, aiTxt, llmsTxt, sitemap } = siteFiles

  // A-1: JSON-LD Tiefengrad
  const pagesWithSpecific = geoPages.filter(p =>
    p.schemaTypes.some(t => SPECIFIC_SCHEMA_TYPES.includes(t))
  )
  const jsonLdPass = pagesWithSpecific.length > 0
  const allSchemaTypes = [...new Set(geoPages.flatMap(p => p.schemaTypes))]
  const specificFound  = allSchemaTypes.filter(t => SPECIFIC_SCHEMA_TYPES.includes(t))
  const genericFound   = allSchemaTypes.filter(t => !SPECIFIC_SCHEMA_TYPES.includes(t))

  // A-2: Entitäts-Verknüpfungen
  const allEntityLinks = geoPages.flatMap(p => p.entityLinks)
  const entityPass = allEntityLinks.length > 0

  // B-3: Q&A-Struktur
  const totalQa = geoPages.reduce((s, p) => s + p.qaCount, 0)
  const allQaExamples = geoPages.flatMap(p => p.qaExamples).slice(0, 5)
  const qaPass = totalQa > 0

  // B-4: Strukturierte Cluster
  const unstructuredPages = geoPages.filter(p => p.wordCount > 400 && p.structuredCount === 0)
  const structuredPass = unstructuredPages.length === 0

  // B-5: Faktendichte (informell) — null-Werte ausschließen
  const measurablePages = geoPages.filter(p => p.factDensity !== null && p.factDensity !== undefined)
  const avgFactDensity = measurablePages.length > 0
    ? Math.round(measurablePages.reduce((s, p) => s + p.factDensity, 0) / measurablePages.length)
    : null

  // C-6: AI-Bots in robots.txt
  const robotsResult = analyzeRobotsTxt(robotsTxt)

  // C-7: ai.txt
  // E-2: llms.txt

  // D-8: Unique Meta-Descriptions
  const metaDescs = (seoPages || [])
    .map(p => (p.description || p.metaDescription || '').trim().toLowerCase())
    .filter(Boolean)
  const dupeMetaSet = metaDescs.filter((v, i, a) => a.indexOf(v) !== i)
  const uniqueMetaPass = dupeMetaSet.length === 0

  // D-9: Generische Ankertexte (Durchschnitt über alle Seiten)
  const avgGenericRatio = geoPages.reduce((s, p) => s + p.genericRatio, 0) / (geoPages.length || 1)
  const anchorPass = avgGenericRatio <= 0.05
  const genericPct = Math.round(avgGenericRatio * 100)

  // E-3: Doppelte/ähnliche Page-Titles
  const titles = (seoPages || []).map(p => (p.pageTitle || p.title || '').trim()).filter(Boolean)
  const dupeTitles = findSimilarTitles(titles)

  // E-4: Schema-Typ-Klassifizierung
  const schemaClassification = buildSchemaClassification(specificFound, genericFound, allSchemaTypes)

  // LLM Snippet-Previews
  const snippetPreviews = geoPages
    .filter(p => p.snippetPreview && p.snippetPreview.length > 30)
    .slice(0, 5)
    .map(p => ({ url: p.url, snippet: p.snippetPreview }))

  // ── Checks zusammenbauen ──────────────────────────────────────────────────
  const checks = [
    {
      id: 'json-ld-specific', category: 'A',
      label: `Spezifisches Schema.org JSON-LD (${specificFound.join(', ') || 'keins'})`,
      pass: jsonLdPass, weight: WEIGHTS['json-ld-specific'],
      value: specificFound.join(', ') || (genericFound.length > 0 ? `nur generisch: ${genericFound.join(', ')}` : 'kein Schema'),
      suggestion: !jsonLdPass
        ? `Kein spezifisches Schema gefunden (${genericFound.length > 0 ? `nur: ${genericFound.join(', ')}` : 'gar keins'}). Nutze: Product, Service, FAQPage, TechArticle, LocalBusiness etc.`
        : null,
    },
    {
      id: 'entity-links', category: 'A',
      label: `Entitäten-Verknüpfungen (sameAs/about): ${allEntityLinks.length} gefunden`,
      pass: entityPass, weight: WEIGHTS['entity-links'],
      value: allEntityLinks.length,
      suggestion: !entityPass
        ? 'Keine Wikidata/Wikipedia-Links in JSON-LD. Füge "sameAs": "https://www.wikidata.org/wiki/Q..." hinzu – damit identifizieren LLMs deine Entitäten eindeutig.'
        : null,
      detail: allEntityLinks.slice(0, 5),
    },
    {
      id: 'qa-structure', category: 'B',
      label: `Q&A-Abschnitte: ${totalQa} Frage/Antwort-Strukturen gefunden`,
      pass: qaPass, weight: WEIGHTS['qa-structure'],
      value: totalQa,
      suggestion: !qaPass
        ? 'Keine H2/H3-Frage + kurzer Antwort-Absatz gefunden. Format: <h2>Was ist X?</h2><p>X ist ... (100-350 Zeichen)</p> - ideales Snippet-Format fuer LLMs.'
        : null,
      detail: allQaExamples,
    },
    {
      id: 'structured-clusters', category: 'B',
      label: `Strukturierte Inhalte: ${unstructuredPages.length} Seiten mit >400 Wörtern ohne Tabelle/Liste`,
      pass: structuredPass, weight: WEIGHTS['structured-clusters'],
      value: unstructuredPages.length,
      suggestion: !structuredPass
        ? `${unstructuredPages.length} Seite(n) haben viel Fließtext ohne Struktur. Ersetze Abschnitte durch <table> oder <ul>/<ol> für bessere LLM-Parsbarkeit.`
        : null,
      detail: unstructuredPages.map(p => p.url).slice(0, 3),
    },
    {
      id: 'sitemap-exists', category: 'C',
      label: sitemap?.exists
        ? `Sitemap vorhanden (${sitemap.urlCount} URLs: ${sitemap.url})`
        : 'Sitemap fehlt (/sitemap.xml nicht gefunden)',
      pass: !!sitemap?.exists, weight: WEIGHTS['sitemap-exists'],
      value: sitemap?.url || null,
      suggestion: !sitemap?.exists
        ? 'Erstelle /sitemap.xml und melde sie in der Google Search Console an. Eine Sitemap hilft Suchmaschinen und LLMs, alle Seiten zu entdecken.'
        : null,
    },
    {
      id: 'ai-bots-allowed', category: 'C',
      label: robotsResult.label,
      pass: robotsResult.pass, weight: WEIGHTS['ai-bots-allowed'],
      value: robotsResult.summary,
      suggestion: robotsResult.suggestion,
      detail: robotsResult.botDetails,
    },
    {
      id: 'unique-meta', category: 'D',
      label: `Unique Meta-Descriptions: ${dupeMetaSet.length > 0 ? dupeMetaSet.length + ' Duplikate' : 'alle eindeutig'}`,
      pass: uniqueMetaPass, weight: WEIGHTS['unique-meta'],
      value: dupeMetaSet.length,
      suggestion: !uniqueMetaPass
        ? `${dupeMetaSet.length} identische Meta-Descriptions. Jede Seite braucht eine einzigartige Beschreibung – doppelte verwirren LLMs beim Seiten-Mapping.`
        : null,
    },
    {
      id: 'anchor-text-quality', category: 'D',
      label: `Anchor-Text-Qualität: ${genericPct}% generische Links`,
      pass: anchorPass, weight: WEIGHTS['anchor-text-quality'],
      value: `${genericPct}%`,
      suggestion: !anchorPass
        ? `${genericPct}% der Links nutzen generische Texte ("mehr", "hier", etc.). LLMs berechnen Relevanz aus dem Ankertext – nutze beschreibende Texte.`
        : null,
    },
    // ── Informelle Checks (weight 0, beeinflussen Score nicht) ──────────────
    {
      id: 'fact-density', category: 'B', informational: true,
      label: avgFactDensity !== null
        ? `Faktendichte: Ø ${avgFactDensity} Datenpunkte / 1.000 Wörter`
        : 'Faktendichte: nicht messbar (JS-gerenderter Inhalt?)',
      pass: avgFactDensity !== null ? avgFactDensity >= 5 : true,
      weight: 0,
      value: avgFactDensity,
      suggestion: avgFactDensity === null
        ? 'Faktendichte konnte nicht ermittelt werden. Mögliche Ursache: Inhalte werden per JavaScript nachgeladen und waren zum Messzeitpunkt nicht sichtbar.'
        : avgFactDensity < 5
          ? 'Geringe Faktendichte. Perplexity und ChatGPT Search ranken Inhalte mit Zahlen, Statistiken und konkreten Daten höher als reine Fließtexte.'
          : null,
    },
    {
      id: 'ai-txt', category: 'C', informational: true,
      label: `ai.txt: ${aiTxt?.exists ? 'vorhanden' : 'fehlt'}`,
      pass: !!aiTxt?.exists, weight: 0,
      value: aiTxt?.content?.slice(0, 100) || null,
      suggestion: !aiTxt?.exists
        ? 'Erstelle /ai.txt zur rechtssicheren Steuerung der KI-Nutzung deiner Inhalte (ähnlich robots.txt, aber für AI-Modell-Training).'
        : null,
    },
    {
      id: 'llms-txt', category: 'E', informational: true,
      label: `llms.txt: ${llmsTxt?.exists ? 'vorhanden' : 'fehlt'}`,
      pass: !!llmsTxt?.exists, weight: 0,
      value: null,
      suggestion: !llmsTxt?.exists
        ? 'Erstelle /llms.txt (Standard von Answer.ai) – strukturierte Markdown-Zusammenfassung deiner Website, die direkt in LLM-Kontextfenster geladen werden kann.'
        : null,
    },
    {
      id: 'no-duplicate-titles', category: 'E', informational: true,
      label: `Einzigartige Page-Titles: ${dupeTitles.length > 0 ? dupeTitles.length + ' ähnliche Paare' : 'alle einzigartig'}`,
      pass: dupeTitles.length === 0, weight: 0,
      value: dupeTitles.length,
      suggestion: dupeTitles.length > 0
        ? `${dupeTitles.length} Seiten-Paare mit sehr ähnlichen Titles (>70% Ähnlichkeit). Doppelte Titles erschweren KI-Modellen die Unterscheidung zwischen Seiten.`
        : null,
      detail: dupeTitles.slice(0, 3),
    },
    {
      id: 'schema-classification', category: 'A', informational: true,
      label: schemaClassification.summary,
      pass: schemaClassification.pass, weight: 0,
      value: allSchemaTypes.join(', ') || null,
      suggestion: schemaClassification.suggestion,
      detail: schemaClassification,
    },
  ]

  // ── Score ─────────────────────────────────────────────────────────────────
  const scored = checks.filter(c => c.weight > 0)
  const totalWeight  = scored.reduce((s, c) => s + c.weight, 0)
  const earnedWeight = scored.filter(c => c.pass).reduce((s, c) => s + c.weight, 0)
  const score = totalWeight > 0 ? Math.round((earnedWeight / totalWeight) * 100) : 0

  return {
    score,
    checks,
    robotsTxtRaw: robotsTxt ? robotsTxt.slice(0, 2000) : null,
    aiTxt:   { exists: !!aiTxt?.exists,  content: aiTxt?.content?.slice(0, 500) || null },
    llmsTxt: { exists: !!llmsTxt?.exists, content: llmsTxt?.content?.slice(0, 500) || null },
    sitemap:  sitemap ?? { exists: false, url: null, urlCount: 0 },
    snippetPreviews,
    schemaClassification,
  }
}

// ── robots.txt Parser ─────────────────────────────────────────────────────────
function analyzeRobotsTxt(content) {
  if (!content) {
    return {
      pass: true,
      label: 'AI-Bots: keine robots.txt gefunden (alle erlaubt)',
      summary: 'keine robots.txt',
      suggestion: 'Keine robots.txt vorhanden – alle Bots sind erlaubt. Erstelle eine, um KI-Training gezielt zu steuern.',
      blocked: [],
      botDetails: AI_BOTS.map(b => ({ ...b, status: 'erlaubt (keine robots.txt)', pass: true })),
    }
  }

  // Alle Regeln pro User-Agent parsen
  const agentRules = new Map()
  let currentAgent = null
  for (const raw of content.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const lc = line.toLowerCase()
    if (lc.startsWith('user-agent:')) {
      currentAgent = lc.replace('user-agent:', '').trim()
      if (!agentRules.has(currentAgent)) agentRules.set(currentAgent, [])
    } else if ((lc.startsWith('disallow:') || lc.startsWith('allow:')) && currentAgent) {
      const type = lc.startsWith('disallow:') ? 'disallow' : 'allow'
      const path = line.split(':').slice(1).join(':').trim()
      agentRules.get(currentAgent)?.push({ type, path })
    }
  }

  const blocked = []
  const botDetails = AI_BOTS.map(bot => {
    const key = bot.name.toLowerCase()
    const specific = agentRules.get(key)
    const fallback = agentRules.get('*') || []
    const rules = specific?.length ? specific : fallback
    const fromWildcard = !specific?.length

    const fullyBlocked = rules.some(r => r.type === 'disallow' && (r.path === '/' || r.path === ''))
    const partial = !fullyBlocked && rules.some(r => r.type === 'disallow' && r.path)

    if (fullyBlocked) blocked.push(bot.name)

    return {
      ...bot,
      pass: !fullyBlocked,
      status: fullyBlocked
        ? 'blockiert (Disallow: /)'
        : partial
          ? 'teilweise eingeschränkt'
          : specific?.length
            ? 'explizit erlaubt'
            : 'erlaubt (via * oder nicht erwähnt)',
      fromWildcard,
      partial,
    }
  })

  const pass = blocked.length === 0
  return {
    pass,
    label: `AI-Bot-Zugang: ${blocked.length > 0 ? blocked.length + ' blockiert' : 'alle erlaubt'}`,
    summary: blocked.length > 0 ? `${blocked.join(', ')} blockiert` : `Alle ${AI_BOTS.length} AI-Bots erlaubt`,
    suggestion: !pass
      ? `${blocked.join(', ')} sind via robots.txt blockiert. Entferne deren Disallow-Regeln, wenn du in ChatGPT Search / Perplexity sichtbar sein willst.`
      : null,
    blocked,
    botDetails,
  }
}

// ── Hilfsfunktionen ───────────────────────────────────────────────────────────
function findSimilarTitles(titles) {
  const similar = []
  for (let i = 0; i < titles.length; i++) {
    for (let j = i + 1; j < titles.length; j++) {
      const sim = stringSimilarity(titles[i], titles[j])
      if (sim > 0.7 && sim < 1) {
        similar.push({ a: titles[i].slice(0, 60), b: titles[j].slice(0, 60), similarity: Math.round(sim * 100) })
      }
    }
  }
  return similar
}

function stringSimilarity(a, b) {
  if (a === b) return 1
  const la = a.toLowerCase(), lb = b.toLowerCase()
  const dist = levenshtein(la, lb)
  return 1 - dist / Math.max(la.length, lb.length, 1)
}

function levenshtein(a, b) {
  const m = a.length, n = b.length
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => j === 0 ? i : 0)
  )
  for (let j = 1; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1])
  return dp[m][n]
}

function buildSchemaClassification(specific, generic, all) {
  if (all.length === 0) {
    return { pass: false, summary: 'Schema-Typ: keins vorhanden', found: [], specific: [], generic: [], suggestion: 'Kein Schema.org JSON-LD vorhanden – füge spezifische Typen hinzu.' }
  }
  if (specific.length === 0) {
    return {
      pass: false,
      summary: `Schema-Typ: nur generisch (${generic.join(', ')})`,
      found: all, specific, generic,
      suggestion: `Nur generische Typen (${generic.join(', ')}) gefunden. Ersetze durch spezifische Typen wie Product, Service, FAQPage.`,
    }
  }
  return {
    pass: true,
    summary: `Schema-Typen: ${specific.join(', ')}${generic.length ? ` + ${generic.join(', ')}` : ''}`,
    found: all, specific, generic, suggestion: null,
  }
}

// ── Site-Dateien abrufen ──────────────────────────────────────────────────────
export async function fetchSiteFiles(startUrl) {
  const base = new URL(startUrl).origin
  const result = {
    robotsTxt: null,
    aiTxt:   { exists: false, content: null },
    llmsTxt: { exists: false, content: null },
  }

  const tryFetch = async (path) => {
    try {
      const res = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(5000) })
      if (res.ok) return await res.text()
    } catch { /* fetch failed – return null */ }
    return null
  }

  const [robots, aiTxt, llmsTxt, sitemapXml, sitemapIndex] = await Promise.all([
    tryFetch('/robots.txt'),
    tryFetch('/ai.txt'),
    tryFetch('/llms.txt'),
    tryFetch('/sitemap.xml'),
    tryFetch('/sitemap_index.xml'),
  ])

  const sitemapContent = sitemapXml || sitemapIndex
  result.robotsTxt = robots
  result.aiTxt   = { exists: !!aiTxt,   content: aiTxt }
  result.llmsTxt = { exists: !!llmsTxt, content: llmsTxt }
  result.sitemap = {
    exists: !!sitemapContent,
    url: sitemapXml ? `${base}/sitemap.xml` : sitemapIndex ? `${base}/sitemap_index.xml` : null,
    urlCount: sitemapContent ? (sitemapContent.match(/<loc>/g) || []).length : 0,
  }

  return result
}
