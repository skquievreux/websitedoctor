# Plan Phase 5 – PDF-Export

## Ziel

Den Website-Doctor-Report als professionelles PDF exportierbar machen.
Kein externer Skill nötig — Playwright ist bereits installiert (`page.pdf()`).

---

## Strategie

**Zwei Wege parallel:**

1. **Quick Win** — `@media print` CSS im bestehenden `index.html` → Browser-Druck (`Cmd+P`) ergibt sofort sauberes PDF
2. **Vollständig** — Separater Server-Endpunkt `GET /export-pdf/:id` mit Playwright-Rendering einer dedizierten Print-Seite

---

## Schritt 1 — `@media print` CSS in `public/index.html`

**Ziel:** Browser-eigenes Drucken (`Cmd+P` / `Strg+P`) ergibt sofort ein lesbares PDF.

**Was hinzufügen:**

```css
@media print {
  aside, header .input-row, .export-bar, .tabs { display: none !important; }
  body { background: #fff; color: #000; }
  .score-card, .card { border: 1px solid #ccc; background: #fff; }
  .score-good { color: #166534; }
  .score-mid  { color: #92400e; }
  .score-bad  { color: #991b1b; }
  main { overflow: visible; }
  .layout { display: block; }
  .page-card { break-inside: avoid; }
}
```

**Betroffene Dateien:** `public/index.html` (nur CSS-Block ergänzen)

---

## Schritt 2 — `public/print.html` (dedizierte Print-Seite)

**Ziel:** Saubere, druckoptimierte HTML-Seite ohne Dark-Mode, Navigation und interaktive Elemente.

**Layout:**
- Weißer Hintergrund, schwarze Schrift, Systemfont
- **Header:** Site-Titel, URL, Datum, Score-Kreis oben rechts
- **Scores-Zeile:** Gesamt / SEO / Mobile als kompakte Kacheln
- **Stärken & Schwächen:** zweispaltig
- **Maßnahmen:** nummerierte Liste
- **SEO-Checks:** Tabelle mit Spalten: Check | Gewicht | Status | Hinweis
- **Gecrawlte Seiten:** Tabelle mit URL | Status | Ladezeit | JS-Fehler
- **Footer:** „Erstellt mit Website Doctor · {datum}"
- Screenshots: standardmäßig ausgeblendet, per `?screenshots=1` einblendbar

**Route zum Aufrufen:** `GET /print/:id` → liefert `print.html` mit vorgeladenen Report-Daten

**Betroffene Dateien:**
- `public/print.html` (neu)
- `server.js` (neue Route `GET /print/:id`)

---

## Schritt 3 — Server-Endpunkt `GET /export-pdf/:id`

**Ziel:** Programmatischer PDF-Download via Playwright.

**Implementierung in `server.js`:**

```js
import { chromium } from 'playwright'

app.get('/export-pdf/:id', async (req, res) => {
  const report = await loadReport(req.params.id)
  if (!report) return res.status(404).json({ error: 'Report nicht gefunden' })

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

  // Interne Print-Seite aufrufen
  await page.goto(`http://localhost:${PORT}/print/${req.params.id}`, {
    waitUntil: 'networkidle'
  })

  const pdf = await page.pdf({
    format: 'A4',
    printBackground: true,
    margin: { top: '1.5cm', bottom: '1.5cm', left: '1.5cm', right: '1.5cm' }
  })

  await browser.close()

  const filename = `website-doctor_${report.hostname}_${req.params.id}.pdf`
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  res.send(pdf)
})
```

**Betroffene Dateien:** `server.js` (neue Route + chromium import)

---

## Schritt 4 — UI-Button in `public/index.html`

**Ziel:** PDF-Download-Button in der bestehenden Export-Leiste.

**Was hinzufügen:**

```html
<!-- In der .export-bar neben JSON und CSV: -->
<button class="btn-export" id="btn-pdf" onclick="exportPdf()">↓ PDF</button>
```

```js
async function exportPdf() {
  if (!currentReport) return
  const btn = document.getElementById('btn-pdf')
  btn.textContent = '…'
  btn.disabled = true
  window.open(`/export-pdf/${currentReport.id}`, '_blank')
  setTimeout(() => { btn.textContent = '↓ PDF'; btn.disabled = false }, 2000)
}
```

**Betroffene Dateien:** `public/index.html` (1 Button + 1 Funktion)

---

## Reihenfolge (empfohlen)

```
Sprint 1 (sofort, kein Risiko):
  Schritt 1 — @media print CSS

Sprint 2 (Kern-Feature):
  Schritt 2 — public/print.html + GET /print/:id Route
  Schritt 3 — GET /export-pdf/:id Server-Endpunkt

Sprint 3 (UI-Abschluss):
  Schritt 4 — PDF-Button in Export-Leiste
```

---

## Betroffene Dateien Gesamtübersicht

| Datei | Schritt | Änderung |
|---|---|---|
| `public/index.html` | 1, 4 | `@media print` CSS + PDF-Button |
| `public/print.html` | 2 | Neu — druckoptimierte Report-Ansicht |
| `server.js` | 2, 3 | Route `GET /print/:id` + `GET /export-pdf/:id` |

---

## Hinweise für nächste Session

- Playwright ist bereits installiert (`npm i` nicht nötig)
- `loadReport(id)` in `server.js` ist bereits vorhanden und kann direkt genutzt werden
- Die Export-Leiste (`#export-bar`) existiert bereits mit JSON + CSV Buttons
- Version nach Abschluss: `2.0.0` → `2.1.0`
