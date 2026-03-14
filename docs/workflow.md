# Workflow

## Kompletter Ablauf: URL → Report (aktueller Stand)

```
1. User öffnet http://localhost:3001
2. Gibt URL ein → POST /check { url: "https://example.com" }
3. Server erzeugt Job-ID (timestamp), startet crawl.js async
4. Frontend pollt GET /status/:id alle 800ms (running → done)

5. crawl.js (Desktop-Crawl):
   a. chromium.launch() headless
   b. Start-URL besuchen, fullPage-Screenshot
   c. analyzeSeo(page) → seo.js (11 Checks)
   d. extractLinks → filterLinks → Queue
   e. Queue abarbeiten (max. 20 Seiten, 2 Ebenen)
   f. crawlMobile(topUrls) → mobile.js (iPhone 13, erste 5 Seiten)
   g. crawl_manifest.json schreiben

6. report.js:
   a. calcScore(pages) → Gesamt-Score
   b. calcSeoScore(seoPages) → SEO-Score
   c. mobileData.score → Mobile-Score
   d. buildStrengths / buildWeaknesses / buildActions
   e. report_[id].json schreiben

7. server.js schreibt Eintrag in data/history.json

8. Frontend erhält "done" → lädt GET /report/:id
9. Report wird in 3 Tabs angezeigt + History-Sidebar aktualisiert
```

## Score-Berechnung

### Gesamt-Score (0–100)

| Kriterium                        | Punkte |
|----------------------------------|--------|
| Alle Seiten HTTP 200             | +30    |
| < 5% Broken Pages                | +15    |
| Ø Ladezeit < 2s                  | +20    |
| Ø Ladezeit < 4s                  | +10    |
| Kontaktseite vorhanden           | +15    |
| Impressum/Legal vorhanden        | +15    |
| Keine Broken Links               | +20    |
| < 3 Broken Links                 | +10    |

### SEO-Score (0–100)
= bestandene SEO-Checks / Gesamt-Checks × 100
(aggregiert über alle gecrawlten Seiten, 11 Checks je Seite)

### Mobile-Score (0–100)
= bestandene Mobile-Checks / Gesamt-Checks × 100
(erste 5 Seiten, 4 Checks je Seite via iPhone13-Emulation)

## Seitentypen (`guessPageType`)

| URL-Muster                        | Typ       |
|----------------------------------|-----------|
| `/` oder `/index`                | `home`    |
| `/contact`, `/kontakt`           | `contact` |
| `/blog`, `/news`, `/artikel`     | `blog`    |
| `/product`, `/shop`, `/leistung` | `product` |
| `/imprint`, `/impressum`, `/legal`, `/datenschutz` | `legal` |
| alles andere                     | `other`   |

## Fehler-Handling

| Fehlerfall | Verhalten |
|---|---|
| Seite Timeout | `statusCode: null`, `loadTime: null`, Crawl läuft weiter |
| Screenshot schlägt fehl | `screenshotPath: null`, kein Abbruch |
| Mobile-Crawl schlägt fehl | `mobileData: null`, kein Abbruch des Haupt-Crawls |
| Crawl komplett fehlgeschlagen | Job-Status `error`, Fehlermeldung im UI |
| SEO-Analyse schlägt fehl | Seite bekommt leeres `issues: []` |
