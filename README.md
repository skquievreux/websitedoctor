# 🩺 Website Doctor

A self-hosted website auditing tool — crawls your site and generates a comprehensive report with SEO analysis, mobile checks, performance timings, and PDF export.

![Version](https://img.shields.io/badge/version-2.1.0-blue)
![Node](https://img.shields.io/badge/node-%3E%3D18-green)
![License](https://img.shields.io/badge/license-MIT-lightgrey)

---

## Features

- **Full-site crawl** — up to 20 pages, 2 levels deep, via Playwright (headless Chromium)
- **SEO analysis** — 11 weighted checks per page (title, meta description, headings, canonical, Open Graph, …)
- **Mobile check** — iPhone 13 emulation, viewport & tap-target audits
- **Performance timings** — TTFB, DOM-ready, fully-loaded per page
- **JavaScript error detection** — first-party vs. third-party errors separated
- **PDF export** — one-click download via Playwright or browser print (Ctrl+P)
- **Report diff** — compare any two historical reports side-by-side
- **Webhooks** — POST notification when score drops below a threshold
- **History** — persistent report history, max. 3 runs per hostname kept

---

## Requirements

- Node.js >= 18
- npm >= 9

---

## Installation

```bash
git clone https://github.com/skquievreux/websitedoctor.git
cd websitedoctor
npm install
npx playwright install chromium
```

The `npm install` step also configures the Git hooks automatically (via the `prepare` script).

---

## Usage

```bash
# Start the server
npm start

# Development mode (auto-reload)
npm run dev
```

Open [http://localhost:3001](http://localhost:3001), enter a URL and click **Prüfen**.

To use a different port:
```bash
PORT=3002 npm start
```

---

## PDF Export

| Method | How |
|---|---|
| Browser print | Load a report → `Ctrl+P` / `Cmd+P` |
| Download button | Load a report → click `↓ PDF` in the export bar |
| Direct URL | `http://localhost:3001/print/<id>` (add `?screenshots=1` for page screenshots) |
| API | `GET /export-pdf/<id>` → streams PDF download |

---

## Cleanup

Remove orphaned screenshots and keep only the last 3 runs per hostname:

```bash
node scripts/cleanup.js --dry-run   # preview
node scripts/cleanup.js             # run
```

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/check` | Start a crawl `{ url }` → `{ id }` |
| `GET` | `/status/:id` | Poll crawl status `{ status, progress }` |
| `GET` | `/report/:id` | Full report as JSON |
| `GET` | `/history` | List of all reports |
| `GET` | `/diff/:idA/:idB` | Compare two reports |
| `GET` | `/print/:id` | Print-optimised HTML (add `?screenshots=1`) |
| `GET` | `/export-pdf/:id` | PDF download via Playwright |
| `POST` | `/webhooks` | Register webhook `{ url, threshold }` |
| `GET` | `/webhooks` | List registered webhooks |
| `DELETE` | `/webhooks` | Remove webhook `{ url }` |

---

## Project Structure

```
websitedoctor/
├── server.js               Express server, all routes, PDF export
├── scripts/
│   ├── crawl.js            Playwright desktop crawl
│   ├── crawl-worker.js     Child-process wrapper (forked by server)
│   ├── links.js            Link extraction & page-type detection
│   ├── seo.js              11 SEO checks + weighted score
│   ├── mobile.js           iPhone 13 emulation, 4 mobile checks
│   ├── report.js           Scoring & report generation
│   └── cleanup.js          Cleanup orphaned screenshots & old runs
├── public/
│   ├── index.html          Web UI (sidebar, tabs, export, diff)
│   └── print.html          Print-optimised report view
├── data/
│   ├── history.json        Persistent report index
│   └── webhooks.json       Registered webhook URLs
├── reports/
│   └── <hostname>/         Report JSONs + screenshots per site
├── .github/
│   └── workflows/
│       └── npm-audit.yml   Security audit on every push & PR
└── .githooks/
    ├── pre-commit          Blocks commits directly on main
    └── pre-push            Reminds to rebase before push to origin
```

---

## Git Workflow

This repo uses branch-based development with protected hooks:

- **`pre-commit`** — blocks accidental commits directly on `main`
- **`pre-push`** — checks whether a rebase on `origin/main` is needed before pushing

Recommended flow for new features:

```bash
git checkout -b feature/my-feature
# ... develop & commit ...
git fetch origin
git rebase origin/main          # keep history clean
git push origin feature/my-feature
# → open Pull Request on GitHub
```

---

## Security

Dependencies are audited automatically on every push and pull request via GitHub Actions (`npm audit --audit-level=high`).

To run locally:
```bash
npm audit
```

---

## License

MIT
