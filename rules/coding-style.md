# Coding Style

## Module-System
- **ESM only** – kein `require()`, kein CommonJS
- `package.json` muss `"type": "module"` enthalten
- Immer `.js`-Extension bei relativen Importen: `import { foo } from './bar.js'`

## Abhängigkeiten
- `chalk` für farbige Terminal-Ausgabe (nur für Server-Logs, nicht im Report)
- `express` für den HTTP-Server
- `playwright` für Browser-Automatisierung (nicht `playwright-cli` im Code)

## Funktionen
- **Max. 30 Zeilen** pro Funktion
- Eine Verantwortung pro Funktion (Single Responsibility)
- Benannte Exports bevorzugen, kein Default-Export in utility-Dateien

## Fehlerbehandlung
- Jeder async-Aufruf in `try/catch` einwickeln
- Fehler mit `chalk.red()` loggen
- Funktion wirft weiter (`throw`) oder gibt `null` zurück – nie still schlucken

## Beispiel-Muster
```js
// ✅ Gut
export async function visitPage(page, url) {
  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 })
    return response?.status() ?? null
  } catch (err) {
    console.error(chalk.red(`[crawl] Fehler bei ${url}: ${err.message}`))
    return null
  }
}

// ❌ Vermeiden
async function doEverything(url) { /* 80 Zeilen... */ }
```

## Dateinamen & Struktur
- `camelCase` für JS-Dateien in `scripts/`
- Keine zirkulären Imports
- `links.js` darf kein Playwright importieren (reine DOM-Logik, via `page.evaluate()`)
