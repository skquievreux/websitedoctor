# Website Doctor – CLAUDE.md

## Stack
- **Runtime:** Node.js >= 18, ESM (`"type": "module"` in package.json)
- **Server:** Express.js (Port 3001, konfigurierbar via `PORT` env)
- **Browser:** Playwright (`playwright` npm, programmatisch in scripts + PDF-Export)
- **CLI-Tool (Agent-Debugging):** `playwright-cli`
- **Logging:** chalk (Terminal-Logs, nicht im Report)
- **Version:** 2.1.0

## Projektstruktur
```
Sitechecker/
├── server.js                  ← Express-Server, Routes, Webhooks, PDF-Export
├── package.json               ← ESM, dependencies (v2.1.0)
├── CLAUDE.md                  ← diese Datei
├── .gitignore
├── rules/
│   ├── coding-style.md        ← ESM, max. 30 Zeilen, try/catch
│   └── agent-behavior.md      ← Crawl-Limits, alle Checks, Output-Formate
├── docs/
│   ├── architecture.md        ← Datenfluss, Dateistruktur
│   ├── workflow.md            ← Ablauf, Scores, Fehler-Handling
│   ├── onboarding.md          ← Setup, Skills, Befehle, PDF-Export
│   └── archive/               ← abgeschlossene Pläne (phase3–5)
├── scripts/
│   ├── crawl.js               ← Playwright Desktop-Loop, orchestriert alles
│   ├── crawl-worker.js        ← Child-Process-Wrapper (vom Server geforkt)
│   ├── links.js               ← extractLinks, filterLinks, guessPageType
│   ├── seo.js                 ← 11 SEO-Checks + calcSeoScore
│   ├── mobile.js              ← iPhone13-Emulation, 4 Mobile-Checks
│   ├── report.js              ← Gesamt + SEO + Mobile Score
│   └── cleanup.js             ← Cleanup: Reports, Screenshots, History
├── public/
│   ├── index.html             ← Web-UI (Sidebar + 4 Tabs + Export + Diff)
│   └── print.html             ← Druckoptimierter Report (PDF-Basis)
├── data/
│   ├── history.json           ← persistente Report-Liste
│   └── webhooks.json          ← Webhook-Konfiguration
├── reports/
│   └── <hostname>/            ← Report-JSONs + Screenshots pro Site
└── screenshots/               ← Legacy (wird durch cleanup.js geleert)
```

## Befehle
```bash
npm install                        # Abhängigkeiten
npx playwright install chromium    # Browser herunterladen
npm start                          # Server auf Port 3001
PORT=3002 npm start                # alternativer Port
npm run dev                        # nodemon watch
node scripts/crawl.js https://...  # Crawler direkt testen
node scripts/cleanup.js --dry-run  # Cleanup-Vorschau
node scripts/cleanup.js            # Cleanup ausführen
```

## @-Importe (ESM)
```js
import express from 'express'
import { chromium, devices } from 'playwright'
import chalk from 'chalk'
import { extractLinks, filterLinks, guessPageType } from './scripts/links.js'
import { analyzeSeo, calcSeoScore } from './scripts/seo.js'
import { crawlMobile } from './scripts/mobile.js'
import { generateReport } from './scripts/report.js'
```

## API-Endpunkte
```
POST /check              { url } → { id }
GET  /status/:id         → { status: 'running'|'done'|'error', progress }
GET  /report/:id         → vollständiger Report als JSON
GET  /history            → [ { id, hostname, url, date, score, pageCount } ]
GET  /diff/:idA/:idB     → Vergleich zweier Reports
GET  /print/:id          → druckoptimiertes HTML (?screenshots=1 für Bilder)
GET  /export-pdf/:id     → PDF-Download via Playwright
POST /webhooks           → Webhook registrieren { url, threshold }
GET  /webhooks           → alle Webhooks
DELETE /webhooks         → Webhook entfernen { url }
GET  /screenshots/*      → statische PNG-Dateien (Legacy)
GET  /reports/*          → statische Report-Dateien
```

## Agent-Debugging mit playwright-cli
```bash
playwright-cli open https://example.com
playwright-cli console    # JS-Fehler sehen
playwright-cli network    # Netzwerk & Response-Header
playwright-cli snapshot   # DOM prüfen
playwright-cli close
```
