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
npm start          # Port 3001
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
# → crawl_manifest.json + screenshots/ + report nicht generiert
```

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
| `server.js` | Express-Server, alle Routes, History-Persistenz |
| `scripts/crawl.js` | Desktop-Crawl + orchestriert SEO + Mobile |
| `scripts/links.js` | Link-Extraktion, Filter, Seitentyp-Erkennung |
| `scripts/seo.js` | 11 SEO-Checks via page.evaluate(), Score |
| `scripts/mobile.js` | iPhone13-Emulation, 4 Mobile-Checks, Screenshots |
| `scripts/report.js` | Gesamt + SEO + Mobile Score, report_*.json |
| `public/index.html` | Web-UI: Sidebar + 3 Tabs |
| `data/history.json` | Persistente Report-Liste (neueste zuerst) |
| `crawl_manifest.json` | Temporär, wird pro Crawl überschrieben |
| `report_[id].json` | Vollständige Reports (bleiben erhalten) |
| `screenshots/` | Desktop-PNGs + `mobile-`-PNGs |

## Installierte Skills

| Skill | Zweck |
|---|---|
| `playwright-cli` | Browser-CLI für Agent-Debugging |
| `playwright-explore-website` | Strukturierte Exploration |
| `playwright-best-practices` | Playwright Best Practices |
| `seo-audit` | SEO-Audit Framework (coreyhaines31) |
| `seo` | Web-Qualität & SEO (addyosmani) |

## Nächste Ausbaustufe

Siehe `docs/plan-phase3.md` für geplante Verbesserungen:
- SEO-Vorschläge mit konkreten Werten (Titel-Text analysiert)
- Ladezeit-Analyse (TTFB, DOM-ready, fully-loaded)
- JavaScript-Fehler via Playwright console-Events
- Response-Header-Analyse (Cache-Control, HTTPS-Headers)
