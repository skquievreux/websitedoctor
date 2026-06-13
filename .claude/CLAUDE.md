# Website Doctor – CLAUDE.md

## Stack
- **Runtime:** Node.js >= 18, ESM (`"type": "module"` in package.json)
- **Server:** Express.js (Port 3001, konfigurierbar via `PORT` env)
- **Browser:** Playwright (`playwright` npm, programmatisch in scripts + PDF-Export)
- **Logging:** chalk (Terminal-Logs, nicht im Report)
- **Version:** 2.1.0

## Befehle
```bash
pnpm start                         # Server auf Port 3001
pnpm dev                           # nodemon watch
node scripts/crawl.js https://...  # Crawler direkt testen
node scripts/cleanup.js --dry-run  # Cleanup-Vorschau
node scripts/cleanup.js            # Cleanup ausführen
```

## Agent-Debugging mit playwright-cli
```bash
playwright-cli open https://example.com
playwright-cli console    # JS-Fehler sehen
playwright-cli network    # Netzwerk & Response-Header
playwright-cli snapshot   # DOM prüfen
playwright-cli close
```

## Relevante Skills
- `run` — Server starten und testen
- `verify` — Feature-Verifikation im Browser
- `code-review` — Code-Review nach Änderungen
- `playwright-cli` — Browser-Debugging
- `git-workflow` — Commit/Branch-Workflow
