# Onboarding

## Voraussetzungen
- Node.js >= 18
- npm >= 9

## Installation

```bash
cd Sitechecker
npm install
npx playwright install chromium
```

## Server starten

```bash
npm start            # Port 3001
PORT=3002 npm start  # alternativer Port

# → http://localhost:3001
```

## Entwicklung (Auto-Reload)

```bash
npm run dev
```

## Crawler direkt testen (ohne Server)

```bash
node scripts/crawl.js https://example.com
# → reports/<hostname>/<id>.json + Screenshots
```

## Cleanup (verwaiste Screenshots & alte Reports)

```bash
node scripts/cleanup.js --dry-run  # Vorschau
node scripts/cleanup.js            # bereinigt
# → löscht Screenshots ohne aktiven Report
# → behält max. 3 Runs pro Hostname
```

## PDF-Export

Zwei Wege:

| Weg | Wie |
|---|---|
| **Browser-Druck** | Report laden → `Strg+P` / `Cmd+P` im Browser |
| **PDF-Download** | Report laden → `↓ PDF` Button in der Export-Leiste |
| **Direkt-URL** | `http://localhost:3001/print/<id>` (mit `?screenshots=1` für Screenshots) |
| **API** | `GET /export-pdf/<id>` → lädt PDF herunter |

## Playwright-CLI für Agent-Debugging

```bash
playwright-cli open https://example.com
playwright-cli snapshot           # DOM-Snapshot
playwright-cli eval "document.title"
playwright-cli screenshot --filename=screenshots/debug.png
playwright-cli console            # Console-Fehler ansehen
playwright-cli network            # Netzwerk-Requests
playwright-cli close
```

## Wichtige Dateien

| Datei | Zweck |
|---|---|
| `server.js` | Express-Server, alle Routes, Webhooks, PDF-Export |
| `scripts/crawl-worker.js` | Child-Process-Wrapper (vom Server geforkt) |
| `scripts/crawl.js` | Desktop-Crawl + orchestriert SEO + Mobile |
| `scripts/links.js` | Link-Extraktion, Filter, Seitentyp-Erkennung |
| `scripts/seo.js` | 11 SEO-Checks via page.evaluate(), Score |
| `scripts/mobile.js` | iPhone13-Emulation, 4 Mobile-Checks, Screenshots |
| `scripts/report.js` | Gesamt + SEO + Mobile Score, schreibt JSON |
| `scripts/cleanup.js` | Cleanup für Reports, Screenshots, History |
| `public/index.html` | Web-UI: Sidebar, 4 Tabs, Export, Diff |
| `public/print.html` | Druckoptimierter Report für PDF-Export |
| `data/history.json` | Persistente Report-Liste (neueste zuerst) |
| `data/webhooks.json` | Registrierte Webhook-URLs |
| `reports/<host>/<id>.json` | Vollständige Reports (strukturiert nach Hostname) |

## API-Endpunkte

```
POST /check              { url } → { id }
GET  /status/:id         → { status, progress, error }
GET  /report/:id         → vollständiger Report (JSON)
GET  /history            → [ { id, hostname, url, date, score, pageCount } ]
GET  /diff/:idA/:idB     → Vergleich zweier Reports
GET  /print/:id          → druckoptimiertes HTML (?screenshots=1 für Bilder)
GET  /export-pdf/:id     → PDF-Download via Playwright
POST /webhooks           → { url, threshold } registrieren
GET  /webhooks           → alle Webhooks
DELETE /webhooks         → { url } entfernen
GET  /screenshots/*      → statische PNG-Dateien
GET  /reports/*          → statische Report-Dateien
```

## Installierte Skills

| Skill | Zweck |
|---|---|
| `playwright-cli` | Browser-CLI für Agent-Debugging |
| `playwright-explore-website` | Strukturierte Exploration |
| `playwright-best-practices` | Playwright Best Practices |
| `seo-audit` | SEO-Audit Framework |
| `seo` | Web-Qualität & SEO |
