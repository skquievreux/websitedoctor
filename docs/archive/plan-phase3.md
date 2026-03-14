# Plan Phase 3 – SEO-Vorschläge, Ladezeiten, JS-Fehler

## Ziel
Den Report von einem Pass/Fail-Checker zu einem **handlungsorientierten Diagnose-Tool** ausbauen:
konkrete SEO-Textvorschläge, Ladezeit-Breakdown, JavaScript-Fehler-Liste.

---

## Task 1 — SEO-Report mit konkreten Vorschlägen und analysiertem Inhalt

**Warum:** Bisher zeigt der SEO-Tab nur ✓/✗ ohne zu sagen *was* falsch ist oder *wie* es besser geht.

### Was sich ändert: `scripts/seo.js`

`analyzeSeo()` gibt zusätzlich zu `pass` auch `value` (tatsächlicher Wert) und `suggestion` (konkrete Empfehlung) zurück:

```js
// Neu: erweitertes Issue-Objekt
{
  label: "Title-Länge 50–60 Zeichen",
  pass: false,
  value: "Willkommen – Meine Website",        // tatsächlicher Titel-Text
  suggestion: "Titel ist 26 Zeichen kurz. Ergänze Keywords, z.B.: 'Willkommen – Meine Website | Webdesign Berlin'"
}
```

**Neue Felder in `page.evaluate()`:**
- `titleText` – der vollständige `<title>`-Inhalt
- `metaDescText` – der vollständige Meta-Description-Text
- `h1Text` – der Text des ersten `<h1>`
- `h2Texts` – Array aller `<h2>`-Texte (für Struktur-Feedback)
- `imgsWithoutAltSrcs` – Dateinamen der Bilder ohne alt-Text

**Suggestion-Logik (einfache Regeln, keine KI):**

| Check failed | Suggestion-Template |
|---|---|
| Title fehlt | `"Füge einen aussagekräftigen <title>-Tag hinzu"` |
| Title zu kurz (< 50) | `"Titel '[value]' ist [n] Zeichen. Füge Keywords hinzu bis 50–60 Zeichen"` |
| Title zu lang (> 60) | `"Titel '[value]' ist [n] Zeichen. Kürze auf max. 60 Zeichen"` |
| Meta-Desc fehlt | `"Füge <meta name='description' content='...'> hinzu (150–160 Zeichen)"` |
| Meta-Desc zu kurz | `"Beschreibung '[value]...' ist [n] Zeichen. Ergänze auf 150–160 Zeichen"` |
| Kein H1 | `"Kein <h1> gefunden. Füge eine Hauptüberschrift hinzu"` |
| Mehrere H1s | `"[n] <h1>-Tags gefunden: '[texts]'. Behalte nur einen"` |
| Bilder ohne Alt | `"[n] Bilder ohne alt-Text: [filenames]. Beschreibe den Bildinhalt"` |
| Kein Canonical | `"Füge <link rel='canonical' href='[url]'> hinzu"` |
| Kein lang-Attribut | `"Füge lang='de' (oder passende Sprache) zum <html>-Tag hinzu"` |

### Was sich ändert: `public/index.html` (SEO-Tab)

Pro Seite: expandierbares Panel mit:
- Bestehende ✓/✗ Checks
- Bei ✗: `value` (grau, kursiv) + `suggestion` (orange, fett) eingeblendet

---

## Task 2 — Ladezeit-Analyse (TTFB, DOM-ready, fully-loaded)

**Warum:** Bisher nur `loadTime` (Zeit bis DOMContentLoaded). Fehlend: Netzwerk-Breakdown und Server-Antwortzeit.

### Was sich ändert: `scripts/crawl.js`

Playwright kann Performance-Metriken via `page.evaluate()` und Response-Timing auslesen:

```js
// Nach page.goto():
const timing = await page.evaluate(() => {
  const t = performance.timing
  return {
    ttfb: t.responseStart - t.requestStart,           // Time to First Byte
    domReady: t.domContentLoadedEventEnd - t.requestStart, // DOM fertig
    fullyLoaded: t.loadEventEnd - t.requestStart      // alles geladen
  }
})

// Response-Header direkt aus Playwright-Response:
const cacheControl = response.headers()['cache-control'] || null
const hsts = response.headers()['strict-transport-security'] || null
```

**Neue Felder pro Seite im Manifest:**
```json
{
  "url": "...",
  "loadTime": 843,
  "timing": {
    "ttfb": 120,
    "domReady": 650,
    "fullyLoaded": 843
  },
  "responseHeaders": {
    "cacheControl": "max-age=3600",
    "hsts": "max-age=31536000"
  }
}
```

### Was sich ändert: `scripts/report.js`

Neue Stärken/Schwächen aus Timing-Daten:
- TTFB > 600ms → Schwäche: "Langsame Server-Antwort (TTFB Ø [n]ms)"
- Kein `cache-control` → Schwäche: "Kein Caching konfiguriert"
- Kein HSTS → Schwäche: "HSTS-Header fehlt (Sicherheitsrisiko)"

### Was sich ändert: `public/index.html` (Übersicht-Tab)

Neue Sektion "Ladezeiten" pro Seite mit 3 Balken:
```
TTFB      ████░░░░ 120ms
DOM-ready ████████░ 650ms
Geladen   █████████ 843ms
```

---

## Task 3 — JavaScript-Fehler via Playwright Console-Events

**Warum:** JS-Fehler im Browser sind unsichtbar im normalen Crawl, können aber SEO (Rendering) und UX stark beeinträchtigen.

### Wie Playwright JS-Fehler sammelt

```js
// Vor page.goto() registrieren:
const jsErrors = []
page.on('console', msg => {
  if (msg.type() === 'error') {
    jsErrors.push({ message: msg.text(), type: 'console-error' })
  }
})
page.on('pageerror', err => {
  jsErrors.push({ message: err.message, url: err.stack?.split('\n')[1]?.trim(), type: 'uncaught' })
})
```

**Neue Felder pro Seite im Manifest:**
```json
{
  "url": "...",
  "jsErrors": [
    { "message": "TypeError: Cannot read properties of null", "type": "uncaught" },
    { "message": "Failed to load resource: 404", "type": "console-error" }
  ]
}
```

### Was sich ändert: `scripts/report.js`

- Seiten mit JS-Fehlern → Schwäche: "[n] Seiten haben JavaScript-Fehler"
- Gesamt-Score: -5 Punkte pro Seite mit Fehlern (max. -20)

### Was sich ändert: `public/index.html`

Neuer Badge auf Page-Cards: rotes "JS ⚠" wenn Fehler vorhanden.
Im SEO-Tab: JS-Fehler-Liste mit Fehlermeldung und Typ.

---

## Reihenfolge der Implementierung

```
Task 1: seo.js (value + suggestion) → index.html SEO-Tab erweitern
Task 2: crawl.js (timing + headers) → report.js + index.html Übersicht
Task 3: crawl.js (jsErrors) → report.js + index.html Badges
```

## Betroffene Dateien

| Datei | Task | Änderung |
|---|---|---|
| `scripts/seo.js` | 1 | `value` + `suggestion` pro Issue |
| `scripts/crawl.js` | 2+3 | timing, responseHeaders, jsErrors |
| `scripts/report.js` | 2+3 | neue Stärken/Schwächen, Score-Anpassung |
| `public/index.html` | 1+2+3 | SEO-Vorschläge, Ladezeit-Balken, JS-Fehler-Badges |
| `rules/agent-behavior.md` | alle | Neue Felder dokumentieren |
