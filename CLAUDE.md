# Website Doctor – CLAUDE.md

## Stack
- **Runtime:** Node.js >= 18, ESM (`"type": "module"` in package.json)
- **Server:** Express.js (Port 3001, konfigurierbar via `PORT` env)
- **Browser:** Playwright (`playwright` npm, programmatisch in scripts)
- **CLI-Tool (Agent-Debugging):** `playwright-cli`
- **Logging:** chalk (Terminal-Logs, nicht im Report)

## Projektstruktur
```
Sitechecker/
├── server.js                  ← Express-Server, Routes, History
├── package.json               ← ESM, dependencies
├── CLAUDE.md                  ← diese Datei
├── .gitignore
├── rules/
│   ├── coding-style.md        ← ESM, max. 30 Zeilen, try/catch
│   └── agent-behavior.md      ← Crawl-Limits, alle Checks, Output-Formate
├── docs/
│   ├── architecture.md        ← Datenfluß, Dateistruktur
│   ├── workflow.md            ← Ablauf, Scores, Fehler-Handling
│   ├── onboarding.md          ← Setup, Skills, Befehle
│   └── plan-phase3.md         ← nächste Ausbaustufe (SEO-Vorschläge, Ladezeiten, JS-Fehler)
├── scripts/
│   ├── crawl.js               ← Playwright Desktop-Loop, orchestriert alles
│   ├── links.js               ← extractLinks, filterLinks, guessPageType
│   ├── seo.js                 ← 11 SEO-Checks + calcSeoScore
│   ├── mobile.js              ← iPhone13-Emulation, 4 Mobile-Checks
│   └── report.js              ← Gesamt + SEO + Mobile Score, report_*.json
├── public/
│   └── index.html             ← Web-UI (Sidebar + 3 Tabs: Übersicht/SEO/Mobile)
├── data/
│   └── history.json           ← persistente Report-Liste
├── screenshots/               ← *.png (desktop) + mobile-*.png
└── report_*.json              ← generierte Reports (je Check-Durchlauf)
```

## Befehle
```bash
npm install                        # Abhängigkeiten
npx playwright install chromium    # Browser herunterladen
npm start                          # Server auf Port 3001
PORT=3002 npm start                # alternativer Port
npm run dev                        # nodemon watch
node scripts/crawl.js https://...  # Crawler direkt testen
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
POST /check          { url } → { id }
GET  /status/:id     → { status: 'running'|'done'|'error', progress }
GET  /report/:id     → vollständiger Report als JSON
GET  /history        → [ { id, url, date, score, pageCount } ]
GET  /screenshots/*  → statische PNG-Dateien
```

## Nächste Schritte (Phase 3)
Siehe `docs/plan-phase3.md`:
- Task 1: SEO-Vorschläge mit konkreten Werten und Suggestions
- Task 2: Ladezeit-Analyse (TTFB, DOM-ready, fully-loaded, Response-Header)
- Task 3: JavaScript-Fehler via Playwright Console-Events

## Agent-Debugging mit playwright-cli
```bash
playwright-cli open https://example.com
playwright-cli console    # JS-Fehler sehen (für Phase 3 Testing)
playwright-cli network    # Netzwerk & Response-Header
playwright-cli snapshot   # DOM prüfen
playwright-cli close
```
