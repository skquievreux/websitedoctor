// stealth-node.js – Stage-1 bot-bypass: rebrowser-playwright + headed real
// Chrome (see skills/greekr4/playwright-bot-bypass). rebrowser-playwright is
// API-compatible with plain playwright, so this stage reuses the exact same
// visitPage()/analyzeSeoV2()/extractLinks() check logic as the normal crawl
// via withStealthPage() — only the browser launch differs.
//
// This clears fingerprint/automation-framework detection (bot.sannysoft.com,
// rebrowser-patches CDP leak, etc.) but NOT behavioral/IP-based challenges
// like a real Cloudflare Turnstile — those escalate further to stealth_fetch.py
// (Scrapling/Camoufox, solve_cloudflare=True), the last-resort stage 2.
process.env.REBROWSER_PATCHES_RUNTIME_FIX_MODE ??= 'addBinding'
const { chromium: stealthChromium } = await import('rebrowser-playwright')

// The only active JS patch: strip Playwright's own detectable signature.
// Everything else (UA, WebGL, plugins) comes from the real headed Chrome —
// faking those individually creates more detectable inconsistencies than
// leaving them alone (see the skill's "Detection Coverage" notes).
function stripPlaywrightArtifacts() {
  for (const k of Object.getOwnPropertyNames(window)) {
    if (/^__pw|pwInitScripts|playwright/i.test(k)) {
      try { delete window[k] } catch { /* non-configurable, ignore */ }
    }
  }
  if (!window.chrome) window.chrome = {}
}

/**
 * Launches a headed, stealth-patched Chrome, runs `fn(page)`, then always
 * closes the browser — even in a headless server, headed mode needs a
 * display (see Dockerfile's `xvfb-run` wrapper).
 */
export async function withStealthPage(fn) {
  const browser = await stealthChromium.launch({
    headless: false,
    channel: 'chrome',
    args: ['--disable-blink-features=AutomationControlled'],
  })
  try {
    const context = await browser.newContext({ locale: 'de-DE' })
    await context.addInitScript(stripPlaywrightArtifacts)
    const page = await context.newPage()
    return await fn(page)
  } finally {
    await browser.close()
  }
}
