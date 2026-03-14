# Architecture

## Aktueller Stand (Phase 2 abgeschlossen)

```
Browser (User)
     │
     │  GET /
     ▼
┌──────────────────────────────────────────────────┐
│  server.js  (Express, Port 3001)                 │
│                                                  │
│  GET  /              → public/index.html         │
│  POST /check         → startet Crawl async       │
│  GET  /status/:id    → Polling (running/done)    │
│  GET  /report/:id    → liefert report_*.json     │
│  GET  /history       → liefert data/history.json │
│  GET  /screenshots/* → statische Bilder          │
└──────────────┬───────────────────────────────────┘
               │ ruft auf
               ▼
┌──────────────────────────────────────────────────┐
│  scripts/crawl.js  (Playwright Desktop)          │
│                                                  │
│  1. chromium.launch() headless                   │
│  2. Seiten besuchen (max. 20, 2 Ebenen)          │
│  3. Screenshot fullPage → screenshots/           │
│  4. analyzeSeo(page) → seo.js                    │
│  5. extractLinks → links.js                      │
│  6. crawlMobile(urls) → mobile.js                │
│  7. crawl_manifest.json schreiben                │
└──────┬───────────────┬──────────────┬────────────┘
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
┌──────────────────────────────────────────────────┐
│  scripts/report.js  (Analyse & Scoring)          │
│                                                  │
│  calcScore(pages)       → Gesamt-Score (0–100)   │
│  calcSeoScore(seoPages) → SEO-Score (0–100)      │
│  buildStrengths/Weaknesses/Actions               │
│  schreibt report_[id].json                       │
└──────────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────┐
│  data/history.json  (Persistenz)                 │
│                                                  │
│  Liste aller Reports: [{ id, url, date,          │
│  score, pageCount }]  — neueste zuerst           │
└──────────────────────────────────────────────────┘
```

## Dateistruktur (aktuell)

```
Sitechecker/
├── server.js                  ← Express, Routes, History-Persistenz
├── package.json               ← ESM, express, playwright, chalk
├── CLAUDE.md                  ← Stack, Befehle, @-Importe
├── .gitignore
├── rules/
│   ├── coding-style.md        ← ESM, max 30 Zeilen, try/catch
│   └── agent-behavior.md      ← Crawl-Limits, SEO-Checks, Mobile-Checks, Output-Formate
├── docs/
│   ├── architecture.md        ← diese Datei
│   ├── workflow.md            ← Ablauf URL→Report, Scores
│   ├── onboarding.md          ← Setup & Befehle
│   └── plan-phase3.md         ← nächste Ausbaustufe
├── scripts/
│   ├── crawl.js               ← Playwright Desktop-Loop
│   ├── links.js               ← extractLinks, filterLinks, guessPageType
│   ├── seo.js                 ← 11 SEO-Checks + Score
│   ├── mobile.js              ← iPhone13-Emulation, 4 Checks
│   └── report.js              ← Gesamt + SEO + Mobile Score
├── public/
│   └── index.html             ← Sidebar, 3 Tabs (Übersicht/SEO/Mobile)
├── data/
│   └── history.json           ← persistente Report-Liste
├── screenshots/               ← *.png (desktop) + mobile-*.png
└── report_*.json              ← generierte Reports (je Check)
```

## Technologie-Entscheidungen

### Playwright
- `playwright` npm-Paket direkt in Scripts — kein `child_process`
- Desktop-Crawl: Chromium headless, fullPage-Screenshots
- Mobile-Crawl: `devices['iPhone 13']` — separate Browser-Session
- `playwright-cli` nur für Agent-Debugging reserviert

### Persistenz
- Kein Datenbankserver — alles JSON im Filesystem
- `data/history.json` — History-Index (kleine Metadaten)
- `report_*.json` — vollständige Reports, per ID referenziert
- `crawl_manifest.json` — temporär, wird pro Crawl überschrieben

### Frontend
- Plain HTML/CSS/JS, kein Framework
- Polling auf `GET /status/:id` (800ms Intervall)
- 3-Tab-Layout: Übersicht / SEO / Mobile
- Sidebar mit History-Einträgen, Klick lädt Report direkt
