# Architecture

## Aktueller Stand (Phase 5 abgeschlossen — v2.1.0)

```
Browser (User)
     │
     │  GET /
     ▼
┌──────────────────────────────────────────────────────┐
│  server.js  (Express, Port 3001)                     │
│                                                      │
│  GET  /                  → public/index.html         │
│  POST /check             → startet Crawl async       │
│  GET  /status/:id        → Polling (running/done)    │
│  GET  /report/:id        → liefert Report-JSON       │
│  GET  /history           → liefert data/history.json │
│  GET  /diff/:idA/:idB    → Vergleich zweier Reports  │
│  GET  /print/:id         → public/print.html (PDF)   │
│  GET  /export-pdf/:id    → PDF via Playwright        │
│  POST /webhooks          → Webhook registrieren      │
│  GET  /webhooks          → Webhook-Liste             │
│  DELETE /webhooks        → Webhook entfernen         │
│  GET  /screenshots/*     → statische Bilder          │
│  GET  /reports/*         → statische Report-Dateien  │
└─────────────────┬────────────────────────────────────┘
                  │ fork()
                  ▼
┌──────────────────────────────────────────────────────┐
│  scripts/crawl-worker.js  (Child-Process)            │
│                                                      │
│  Isolierter Crawl-Prozess — kommuniziert via         │
│  process.send({ type: 'progress'|'done'|'error' })   │
└──────────────┬───────────────────────────────────────┘
               │ ruft auf
               ▼
┌──────────────────────────────────────────────────────┐
│  scripts/crawl.js  (Playwright Desktop)              │
│                                                      │
│  1. chromium.launch() headless                       │
│  2. Seiten besuchen (max. 20, 2 Ebenen)              │
│  3. Screenshot fullPage → reports/<host>/            │
│  4. analyzeSeo(page) → seo.js                        │
│  5. extractLinks → links.js                          │
│  6. crawlMobile(urls) → mobile.js                    │
│  7. generateReport → report.js                       │
└──────┬───────────────┬──────────────┬────────────────┘
       │               │              │
       ▼               ▼              ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────────┐
│  links.js    │ │  seo.js      │ │  mobile.js        │
│              │ │              │ │                   │
│ extractLinks │ │ analyzeSeo   │ │ crawlMobile       │
│ filterLinks  │ │ calcSeoScore │ │ iPhone13-Emul.    │
│ guessPageType│ │ 11 Checks    │ │ 4 Mobile-Checks   │
└──────────────┘ └──────────────┘ └──────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────┐
│  scripts/report.js  (Analyse & Scoring)              │
│                                                      │
│  calcScore(pages)       → Gesamt-Score (0–100)       │
│  calcSeoScore(seoPages) → SEO-Score (0–100)          │
│  buildStrengths/Weaknesses/Actions                   │
│  schreibt reports/<hostname>/<id>.json               │
└──────────────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────┐
│  data/history.json  (Persistenz)                     │
│                                                      │
│  Liste aller Reports: [{ id, hostname, url, date,    │
│  score, pageCount, reportPath }]  — neueste zuerst   │
└──────────────────────────────────────────────────────┘
```

## Dateistruktur (aktuell)

```
Sitechecker/
├── server.js                  ← Express, Routes, Webhooks, PDF-Export
├── package.json               ← ESM, express, playwright, chalk (v2.1.0)
├── CLAUDE.md                  ← Stack, Befehle, @-Importe
├── .gitignore
├── rules/
│   ├── coding-style.md        ← ESM, max 30 Zeilen, try/catch
│   └── agent-behavior.md      ← Crawl-Limits, SEO-Checks, Mobile-Checks
├── docs/
│   ├── architecture.md        ← diese Datei
│   ├── workflow.md            ← Ablauf URL→Report, Scores
│   ├── onboarding.md          ← Setup & Befehle
│   └── archive/               ← abgeschlossene Pläne (phase3–5)
├── scripts/
│   ├── crawl.js               ← Playwright Desktop-Loop
│   ├── crawl-worker.js        ← Child-Process-Wrapper für server.js
│   ├── links.js               ← extractLinks, filterLinks, guessPageType
│   ├── seo.js                 ← 11 SEO-Checks + Score
│   ├── mobile.js              ← iPhone13-Emulation, 4 Checks
│   ├── report.js              ← Gesamt + SEO + Mobile Score
│   └── cleanup.js             ← Bereinigt Reports, Screenshots, History
├── public/
│   ├── index.html             ← Web-UI (Sidebar, Tabs, Export, Diff)
│   └── print.html             ← Druckoptimierte Report-Ansicht (PDF)
├── data/
│   ├── history.json           ← persistente Report-Liste
│   └── webhooks.json          ← registrierte Webhook-URLs
├── reports/
│   └── <hostname>/            ← Report-JSONs + Screenshots pro Site
│       ├── <id>.json
│       └── screenshots/
└── screenshots/               ← (Legacy, wird durch cleanup.js geleert)
```

## Technologie-Entscheidungen

### Playwright
- `playwright` npm-Paket direkt in Scripts — kein externer Browser nötig
- Desktop-Crawl: Chromium headless, fullPage-Screenshots
- Mobile-Crawl: `devices['iPhone 13']` — separate Browser-Session
- PDF-Export: `page.pdf()` via eigenem `chromium.launch()` im Server
- `playwright-cli` nur für Agent-Debugging reserviert

### Persistenz
- Kein Datenbankserver — alles JSON im Filesystem
- `data/history.json` — History-Index (Metadaten, max. 3 Runs pro Host)
- `reports/<hostname>/<id>.json` — vollständige Reports
- `data/webhooks.json` — Webhook-Konfiguration

### Frontend
- Plain HTML/CSS/JS, kein Framework
- Polling auf `GET /status/:id` (800ms Intervall)
- 4-Tab-Layout: Übersicht / SEO / Mobile / Vergleich
- Sidebar mit History, Klick lädt Report direkt
- Export-Leiste: JSON, CSV, PDF
- `@media print` CSS für Browser-eigenes Drucken (Strg+P)

### Cleanup
- `node scripts/cleanup.js` — bereinigt verwaiste Screenshots und alte Runs
- `--dry-run` für Vorschau ohne Änderungen
- Behält max. 3 Runs pro Hostname in History und Reports
