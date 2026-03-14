# Plan Phase 4 – Zuverlässigkeit, Gewichtung, Diff & Export

## Scope

Minor-Version-Ausbau auf Basis der Review-Erkenntnisse nach Phase 3.
Ziel: Vom One-Shot-Tool zum verlässlichen Diagnose-Werkzeug.

Die 11 Punkte sind in vier Blöcke gruppiert — von einfach/sicher bis aufwändig/architektonisch.

---

## Block A — Fixes & Zuverlässigkeit (wenig Risiko, sofortiger Gewinn)

### A1 — Navigation Timing API v2 statt deprecated `performance.timing`

**Problem:** `performance.timing` (v1) ist deprecated und in manchen Browsern/SPAs unzuverlässig.

**Fix in `scripts/crawl.js`:**
```js
const timing = await page.evaluate(() => {
  const nav = performance.getEntriesByType('navigation')[0]
  if (!nav) return null
  return {
    ttfb:        Math.round(nav.responseStart - nav.requestStart),
    domReady:    Math.round(nav.domContentLoadedEventEnd - nav.requestStart),
    fullyLoaded: Math.round(nav.loadEventEnd - nav.requestStart),
    // Bonus aus v2:
    dnsLookup:   Math.round(nav.domainLookupEnd - nav.domainLookupStart),
    tcpConnect:  Math.round(nav.connectEnd - nav.connectStart),
  }
}).catch(() => null)
```

**Bonus:** `dnsLookup` + `tcpConnect` stehen jetzt kostenlos zur Verfügung und können optional angezeigt werden.

**Betroffene Dateien:** `scripts/crawl.js` (1 Block), `public/index.html` (optional: 2 neue Zeilen in timing-bars)

---

### A2 — Race-Condition-Fix für JS-Fehler-Listener

**Problem:** Listener werden vor `page.goto()` registriert — korrekt. Aber `page.off()` nach dem `catch`-Block läuft nur wenn `page` noch existiert. Außerdem: Listener bleiben bei wiederverwendeter `page`-Instanz über mehrere Seiten aktiv und häufen sich auf.

**Fix:** Listener-Pattern mit einmaligem Array-Reset pro Seite, sauberes `off()` in `finally`:
```js
async function visitPage(page, url) {
  const jsErrors = []
  const handleConsole = msg => { if (msg.type() === 'error') jsErrors.push(...) }
  const handlePageError = err => { jsErrors.push(...) }
  page.on('console', handleConsole)
  page.on('pageerror', handlePageError)
  try {
    // ... goto, timing, headers
    return { ..., jsErrors }
  } catch (err) {
    return { ..., jsErrors }
  } finally {
    page.off('console', handleConsole)
    page.off('pageerror', handlePageError)
  }
}
```

**Betroffene Dateien:** `scripts/crawl.js` (1 Funktion)

---

### A3 — JS-Fehler-Filter: Third-Party-Fehler ignorieren

**Problem:** Ad-Netzwerke, Analytics und Consent-Tools werfen ständig harmlose Fehler. `-5 Punkte` für `doubleclick.net failed to load` ist unfair.

**Heuristik — Filter in `visitPage()`:**
```js
const THIRD_PARTY_PATTERNS = [
  /doubleclick\.net/, /googlesyndication/, /googletagmanager/,
  /facebook\.net/, /connect\.facebook/, /analytics\.google/,
  /cookiebot/, /usercentrics/
]

function isThirdPartyError(msg) {
  return THIRD_PARTY_PATTERNS.some(p => p.test(msg))
}

// Beim Sammeln:
if (msg.type() === 'error' && !isThirdPartyError(msg.text())) {
  jsErrors.push({ message: msg.text(), type: 'console-error' })
}
```

Jeder Fehler bekommt zusätzlich das Flag `firstParty: true/false` — so kann die UI beides zeigen aber der Score-Abzug greift nur auf First-Party.

**Betroffene Dateien:** `scripts/crawl.js`, `scripts/report.js` (Score-Abzug nur bei `firstParty: true`)

---

## Block B — Score-Qualität & Seiten-Kontext

### B1 — Gewichteter SEO-Score (Prioritäts-Ranking)

**Problem:** Jeder der 11 SEO-Checks zählt gleich. Ein fehlender `<h1>` wiegt genauso wie ein fehlender Viewport-Meta — das spiegelt reale SEO-Prioritäten nicht wider.

**Gewichtungstabelle (Summe aller Gewichte = 100):**

| Check | Gewicht | Begründung |
|---|---|---|
| Title vorhanden | 15 | Pflicht, ohne Title kein Ranking |
| Title-Länge 50–60 | 5 | Optimierung, nicht Pflicht |
| Meta-Description vorhanden | 10 | Wichtig für CTR |
| Meta-Description Länge | 3 | Optimierung |
| Genau ein H1 | 12 | Stärkstes On-Page-Signal |
| Canonical vorhanden | 10 | Kritisch bei Duplicate Content |
| Robots nicht noindex | 15 | Totalausfall wenn falsch |
| lang-Attribut | 5 | Wichtig für Mehrsprachigkeit |
| Viewport-Meta | 8 | Mobile-First-Index |
| Alle Bilder mit Alt-Text | 10 | Accessibility + Bild-SEO |
| HTTPS | 7 | Ranking-Faktor |

**Implementierung in `scripts/seo.js`:**
```js
const WEIGHTS = {
  'title-present': 15, 'title-length': 5,
  'meta-desc-present': 10, 'meta-desc-length': 3,
  'h1-count': 12, 'canonical': 10, 'robots': 15,
  'lang': 5, 'viewport': 8, 'img-alt': 10, 'https': 7
}
// Jedes Issue bekommt eine id und ein weight
// calcSeoScore() summiert passed * weight statt passed / total
```

**Betroffene Dateien:** `scripts/seo.js`, `public/index.html` (Gewicht als kleines Badge neben jedem Check anzeigen: `[15]`)

---

### B2 — Seiten-Kontext: nicht-indexierbare Seiten ausklammern

**Problem:** Login-Seiten, Danke-Seiten, Warenkorb, Admin-URLs brauchen kein Canonical und kein H1. Falsch-negative senken den SEO-Score.

**Erkennung via `guessPageType()` aus `links.js` + URL-Heuristik:**
```js
const NON_INDEX_PATTERNS = [
  /\/login/, /\/logout/, /\/cart/, /\/checkout/,
  /\/thank/, /\/danke/, /\/admin/, /\/wp-admin/,
  /\/account/, /\/order-confirmation/
]

function isIndexablePage(url) {
  return !NON_INDEX_PATTERNS.some(p => p.test(url))
}
```

Für nicht-indexierbare Seiten:
- Checks wie `canonical`, `h1`, `meta-description` werden übersprungen (nicht als `fail` gewertet)
- Im SEO-Tab: Badge `nicht indexiert – Checks übersprungen` statt ⚠️

**Betroffene Dateien:** `scripts/seo.js` (isIndexablePage-Guard vor issue-Array), `public/index.html` (Badge)

---

### B3 — Gewichteter Gesamt-Score (statt additiv)

**Problem:** Additive Punkte erlauben Kombinationen die sich falsch anfühlen: `+15 Impressum` + `+15 Kontakt` + `0 für 5 Broken Links` = 30 Punkte trotz kaputter Site.

**Neues Modell — malus-basiert:**
```
Basis: 100 Punkte
Abzüge:
  - Pro Broken Page: -10 (max -40)
  - Ladezeit Ø > 4s: -20, > 2s: -10
  - Keine Kontaktseite: -10
  - Kein Impressum: -10
  - Broken Links: -5 pro Link (max -15)
  - Pro Seite mit First-Party-JS-Fehlern: -5 (max -20)
```

Ergebnis: Eine Site mit 10 Broken Links startet nicht bei 0 und sammelt Punkte — sie startet bei 100 und verliert welche. Psychologisch richtiger, mathematisch vorhersehbarer.

**Betroffene Dateien:** `scripts/report.js` (`calcScore()` komplett umschreiben), `rules/agent-behavior.md` (Score-Logik dokumentieren)

---

## Block C — Features (Nutzen & Output)

### C1 — Diff-Funktion: Zwei Reports vergleichen

**Warum:** „Was hat sich seit letzter Woche verschlechtert?" ist das wertvolle Signal.

**Neuer API-Endpunkt in `server.js`:**
```
GET /diff/:idA/:idB  →  DiffReport
```

**DiffReport-Struktur:**
```json
{
  "scoreChange": -12,
  "newWeaknesses": ["HSTS-Header fehlt"],
  "resolvedWeaknesses": ["Keine Kontaktseite gefunden"],
  "seoScoreChange": +5,
  "newPages": ["/neue-seite"],
  "removedPages": ["/alte-seite"],
  "pageChanges": [
    { "url": "/", "loadTimeChange": +340, "jsErrorsChange": +2 }
  ]
}
```

**UI:** Neuer „Vergleichen"-Button in der Sidebar wenn ≥ 2 History-Einträge vorhanden. Öffnet ein Modal zur Auswahl zweier Reports. Diff-Tab erscheint nach Auswahl.

**Betroffene Dateien:** `server.js` (neuer Route), `public/index.html` (Vergleich-UI + Diff-Tab)

---

### C2 — Export (JSON-Download + CSV)

**Warum:** Report ist aktuell nur im Browser sehbar — kein Teilen, kein Archiv.

**Minimal-Implementierung ohne Backend-Änderung:**

JSON: bereits vorhanden via `/report/:id` — Button der den Browser-Download triggert.

CSV: clientseitig aus Report-Daten generieren:
```js
function exportCsv(r) {
  const rows = [['URL', 'Status', 'Ladezeit', 'SEO-Score', 'JS-Fehler']]
  r.pages.forEach(p => rows.push([p.url, p.statusCode, p.loadTime, '–', p.jsErrors.length]))
  const csv = rows.map(r => r.join(';')).join('\n')
  downloadBlob(csv, `report_${r.id}.csv`, 'text/csv')
}
```

**Betroffene Dateien:** `public/index.html` (2 Export-Buttons im Header wenn Report geladen, 1 JS-Funktion)

---

## Block D — Architektur (größerer Aufwand, hoher Langzeitnutzen)

### D1 — Crawl aus dem Server-Prozess auslagern (Worker/Child-Process)

**Problem:** `crawl()` läuft synchron im Express-Prozess. Bei 20 Seiten × 10s = 200s blockiert der Node-Event-Loop für andere Requests.

**Lösung: `child_process.fork()` statt direktem Aufruf:**
```js
// server.js
import { fork } from 'child_process'

const child = fork('./scripts/crawl-worker.js', [url, id])
child.on('message', msg => {
  if (msg.type === 'progress') jobs[id].progress = msg.data
  if (msg.type === 'done') jobs[id].status = 'done'
  if (msg.type === 'error') jobs[id].status = 'error'
})
```

```js
// scripts/crawl-worker.js (neu)
import { crawl } from './crawl.js'
crawl(process.argv[2], progress => process.send({ type: 'progress', data: progress }))
  .then(manifest => { generateReport(manifest, process.argv[3]); process.send({ type: 'done' }) })
  .catch(err => process.send({ type: 'error', data: err.message }))
```

**Vorteil:** Server bleibt responsiv, mehrere Crawls parallel möglich.

**Betroffene Dateien:** `server.js` (fork statt direkter Import), `scripts/crawl-worker.js` (neu, ~20 Zeilen)

---

### D2 — Webhook/Notification bei Score-Abfall

**Warum:** Ohne Monitoring ist es ein One-Shot-Tool, kein Monitor.

**Minimal-Implementierung:**
- `POST /webhooks` — URL + threshold (z.B. score < 70) speichern
- Nach jedem Crawl: wenn score < threshold → HTTP POST an konfigurierte URL mit Report-Summary
- Konfiguration über `data/webhooks.json`

**Kein eigenes Scheduling** in Phase 4 — das würde den Scope sprengen. Webhook-Trigger nur nach manuellem Check. Scheduling ist Phase 5.

---

### D3 — Screenshot-Vergleich (Visual Diff)

**Warum:** Visuelles Diff zeigt Layout-Regressionen sofort.

**Playwright-nativ:** `pixelmatch`-Library oder Playwright's eingebauter `expect(page).toHaveScreenshot()`.

**Ansatz:**
- Beim Crawl: Screenshot-Dateinamen basierend auf URL-Slug (bereits so) → konsistent zwischen Runs
- Visual-Diff-Endpunkt: `GET /diff-screenshot/:slugA/:slugB` → PNG mit rotem Overlay wo Unterschiede
- `pixelmatch` npm-Paket (keine Playwright-Abhängigkeit nötig)

**Scope-Warnung:** Nur sinnvoll wenn D1 (Worker) umgesetzt ist, da Image-Vergleich CPU-intensiv.

---

## Empfohlene Reihenfolge

```
Sprint 1 (sicher, sofortiger Gewinn):
  A1 Navigation Timing v2
  A2 Race-Condition-Fix
  A3 Third-Party-Filter

Sprint 2 (Score-Qualität):
  B1 Gewichteter SEO-Score
  B3 Malus-basierter Gesamt-Score
  B2 Seiten-Kontext (nicht-indexierbar)

Sprint 3 (Features):
  C2 Export (JSON + CSV)   ← wenig Aufwand, hoher Nutzen
  C1 Diff-Funktion

Sprint 4 (Architektur):
  D1 Worker/Child-Process
  D2 Webhook
  D3 Screenshot-Vergleich (optional, nur mit D1)
```

## Betroffene Dateien Gesamtübersicht

| Datei | Block | Änderung |
|---|---|---|
| `scripts/crawl.js` | A1, A2, A3 | Timing v2, finally-Pattern, Third-Party-Filter |
| `scripts/seo.js` | B1, B2 | Gewichte, isIndexablePage-Guard |
| `scripts/report.js` | A3, B3 | First-Party-Filter im Score, Malus-Modell |
| `server.js` | C1, D1, D2 | Diff-Route, fork(), Webhook |
| `scripts/crawl-worker.js` | D1 | Neu (~20 Zeilen) |
| `public/index.html` | B1, C1, C2 | Gewichts-Badges, Diff-UI, Export-Buttons |
| `rules/agent-behavior.md` | B3 | Score-Logik dokumentieren |
| `data/webhooks.json` | D2 | Neu (Konfigurationsdatei) |
