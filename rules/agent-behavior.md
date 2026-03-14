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
playwright-cli eval "document.querySelectorAll('h1').length"
playwright-cli screenshot --filename=debug.png
playwright-cli console                         # JS-Fehler + Logs
playwright-cli network                         # Netzwerk-Requests
playwright-cli close
```

## Crawl-Ablauf (Limits & Kriterien)

| Parameter        | Wert          | Begründung                          |
|-----------------|---------------|-------------------------------------|
| Max. Seiten     | 20            | Performance, kein Endlos-Crawl      |
| Timeout/Seite   | 10.000 ms     | Träge Seiten nicht ewig warten      |
| Screenshot-Typ  | fullPage PNG  | Vollständige visuelle Erfassung     |
| Browser         | Chromium      | Headless, kein sichtbares Fenster   |
| Tiefe           | 2 Ebenen      | Start-URL + direkte Unterseiten     |
| Nur intern      | Ja            | Keine externen Domains crawlen      |
| Mobile-Seiten   | erste 5       | Subset für Performance              |
| Mobile-Device   | iPhone 13     | 390×844, Touch, Mobile UA           |

## Gesammelte Daten pro Seite (crawl_manifest.json)

```json
{
  "url": "https://example.com/",
  "statusCode": 200,
  "title": "Example Domain",
  "type": "home",
  "screenshotPath": "screenshots/example-com-.png",
  "links": ["https://example.com/about"],
  "loadTime": 843
}
```

## SEO-Checks (scripts/seo.js) — seo-audit + addyosmani/seo Skill

11 Checks pro Seite via `page.evaluate()`:

| Check | Grenzwert | Quelle |
|---|---|---|
| `<title>` vorhanden | > 0 Zeichen | seo skill |
| `<title>` Länge | 50–60 Zeichen | seo skill |
| `<meta description>` vorhanden | > 0 Zeichen | seo-audit skill |
| `<meta description>` Länge | 150–160 Zeichen | seo-audit skill |
| Genau ein `<h1>` | h1s === 1 | seo-audit skill |
| Canonical-Tag vorhanden | `<link rel="canonical">` | seo skill |
| Robots nicht noindex | kein `noindex` | seo-audit skill |
| `lang`-Attribut gesetzt | lang.length > 0 | seo skill |
| Viewport-Meta korrekt | `width=device-width` | seo skill |
| Alle `<img>` mit Alt-Text | imgsWithoutAlt === 0 | seo skill |
| HTTPS | URL starts with `https://` | seo skill |

**SEO-Score** = bestandene Checks / Gesamt × 100

## Mobile-Checks (scripts/mobile.js) — seo-audit Mobile + seo skill

4 Checks pro Seite, iPhone 13 Emulation:

| Check | Grenzwert | Quelle |
|---|---|---|
| Viewport-Meta korrekt | `width=device-width` | seo skill |
| Kein horizontales Scrollen | `scrollWidth <= clientWidth` | seo-audit skill |
| Schriftgröße ≥ 14px | `font-size >= 14px` | seo skill |
| Tap-Targets ausreichend groß | Breite & Höhe ≥ 44px | seo skill |

**Mobile-Score** = bestandene Checks / Gesamt × 100

## Geplante Erweiterungen (Phase 3)

Neue Daten die `crawl.js` sammeln wird:
- `ttfb` – Time to First Byte (ms)
- `domReady` – DOMContentLoaded (ms)
- `fullyLoaded` – Load-Event (ms)
- `jsErrors` – Array von `{ message, url, line }` aus page-Events
- `responseHeaders` – `{ cacheControl, hsts, contentType }`

Neue SEO-Felder die `seo.js` liefern wird:
- `titleText` – tatsächlicher Titel-Text
- `titleSuggestion` – konkrete Verbesserung wenn Check failed
- `metaDescText` – tatsächliche Meta-Description
- `metaDescSuggestion` – konkrete Verbesserung
- `h1Text` – tatsächlicher H1-Text
- `h2Texts[]` – alle H2-Texte

## Output-Format (aktuell vollständig)

### crawl_manifest.json
```json
{
  "startUrl": "https://example.com",
  "crawledAt": "2026-03-14T10:00:00.000Z",
  "pages": [ { "url", "statusCode", "title", "type", "screenshotPath", "links", "loadTime" } ],
  "seoPages": [ { "url", "issues": [ { "label", "pass" } ] } ],
  "mobileData": { "score", "checks": [ { "label", "pass" } ], "pages": [ { "url", "title", "screenshotPath" } ] }
}
```

### report_[id].json
```json
{
  "id": "1773512104337",
  "url": "https://example.com",
  "timestamp": "2026-03-14T10:00:00.000Z",
  "pageCount": 8,
  "score": 72,
  "strengths": ["..."],
  "weaknesses": ["..."],
  "actions": ["..."],
  "seo": { "score": 64, "pages": [ { "url", "issues": [ { "label", "pass" } ] } ] },
  "mobile": { "score": 75, "checks": [ { "label", "pass" } ], "pages": [ { "url", "title", "screenshotPath" } ] },
  "pages": [ { "url", "type", "statusCode", "title", "loadTime", "screenshotPath" } ]
}
```

### data/history.json
```json
[
  { "id": "1773512104337", "url": "https://example.com", "date": "2026-03-14T...", "score": 72, "pageCount": 8 }
]
```
