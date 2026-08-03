# Agent Behavior

## Playwright-Nutzung im Code (programmatisch)

```js
import { chromium, devices } from 'playwright'

// Desktop
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext()
const page = await context.newPage()

// Mobile (iPhone 13)
const mobileContext = await browser.newContext({ ...devices['iPhone 13'] })
```

## Playwright-CLI (nur Agent / Debugging)

`playwright-cli` **nicht** im Produktionscode — nur für manuelle Inspektion.

```bash
playwright-cli open https://example.com
playwright-cli snapshot                        # DOM-Referenzen ansehen
playwright-cli eval "document.title"
playwright-cli screenshot --filename=debug.png
playwright-cli console                         # JS-Fehler + Logs
playwright-cli network                         # Netzwerk-Requests
playwright-cli close
```

## Crawl-Limits

| Parameter      | Wert         |
|----------------|--------------|
| Max. Seiten    | 20           |
| Timeout/Seite  | 10.000 ms    |
| Tiefe          | 2 Ebenen     |
| Mobile-Seiten  | erste 5      |
| Mobile-Device  | iPhone 13    |

## SEO-Checks (scripts/seo.js) — 11 Checks pro Seite

title vorhanden/Länge (50–60), meta description vorhanden/Länge (150–160), genau ein h1, canonical-Tag, kein noindex, lang-Attribut, viewport-meta, alle img mit alt, HTTPS.

**Score** = bestandene Checks / 11 × 100

## Mobile-Checks (scripts/mobile.js) — 4 Checks, iPhone 13

viewport-meta, kein horizontales Scrollen, Schriftgröße ≥ 14px, Tap-Targets ≥ 44px.
