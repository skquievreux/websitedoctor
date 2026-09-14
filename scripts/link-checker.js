// link-checker.js – lightweight broken-internal-link sweep (seo-audit-Skill-
// Abgleich, 2026-09). crawl.js only ever visits MAX_PAGES=20 pages with a
// full Playwright load, and only the homepage's links extend the crawl
// queue (see crawl.js) — every other discovered internal link is never
// itself checked for a working status. A full Playwright visit per link
// would be far too slow for links that only need a status code, so this
// does plain HEAD requests instead (falling back to GET when a server
// rejects HEAD, which some do for 405/403).
const CONCURRENCY = 8
const TIMEOUT_MS = 8000

async function checkOne(url) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    let res = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: controller.signal })
    if (res.status === 405 || res.status === 403) {
      res = await fetch(url, { method: 'GET', redirect: 'follow', signal: controller.signal })
    }
    return { url, statusCode: res.status, ok: res.ok }
  } catch (err) {
    return { url, statusCode: null, ok: false, error: err.name === 'AbortError' ? 'timeout' : err.message }
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Checks a deduped list of URLs with bounded concurrency, returns only the
 * broken ones (network error or non-2xx/3xx status).
 */
export async function findBrokenLinks(urls) {
  const queue = [...new Set(urls)]
  const broken = []

  async function worker() {
    while (queue.length > 0) {
      const url = queue.shift()
      const result = await checkOne(url)
      if (!result.ok) broken.push(result)
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker))
  return broken
}

// Self-Check: node scripts/link-checker.js --self-test
// ponytail: mockt global.fetch statt echtes Netzwerk zu treffen — testet
// die Queue-/Konkurrenz-/ok-vs-broken-Logik, nicht ob das Internet lebt.
if (process.argv[2] === '--self-test') {
  const responses = {
    'https://ok.test/a':     { status: 200, ok: true },
    'https://ok.test/b':     { status: 301, ok: true },
    'https://broken.test/c': { status: 404, ok: false },
    'https://needs-get.test/d': { status: 405, ok: false, thenGet: { status: 200, ok: true } },
  }
  const originalFetch = globalThis.fetch
  let getCalledFor = null
  globalThis.fetch = async (url, opts) => {
    const entry = responses[url]
    if (!entry) throw new Error(`unerwartete Test-URL: ${url}`)
    if (opts.method === 'GET' && entry.thenGet) { getCalledFor = url; return entry.thenGet }
    return entry
  }

  const assert = (cond, msg) => { if (!cond) throw new Error(`Self-Test fehlgeschlagen: ${msg}`) }
  const broken = await findBrokenLinks(Object.keys(responses))
  globalThis.fetch = originalFetch

  assert(broken.length === 1, `erwartet 1 broken Link, bekam ${broken.length}`)
  assert(broken[0].url === 'https://broken.test/c', 'falscher Link als broken markiert')
  assert(getCalledFor === 'https://needs-get.test/d', '405 sollte GET-Fallback auslösen')
  console.log('[link-checker] Self-Test OK')
}
