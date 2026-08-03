# Sitechecker: Feature Roadmap & Optimization Plan

## 🚨 URGENT – Phase 1: System-Stabilität (Diese Woche)

### Problem
- Versuch, 26 Projekte parallel zu crawlen = **Systemüberlastung**
- Chrome-Prozesse ohne Limits
- Memory-Leaks durch Screenshot-Ansammlung

### Lösung: Queue-basiertes System
```
┌─────────────────────────────────────────────┐
│ POST /check?batch=true                      │
│ { urls: [...26 URLs...] }                   │
└─────────────────────────────────────────────┘
                    ↓
┌──────────────────────────────────────────────────┐
│ Queue Manager: MAX_CONCURRENT_CRAWLS = 2        │
├──────────────────────────────────────────────────┤
│ Pending: [23 projects]                           │
│ Running: [ai2go, dreamedit]                      │
│ Completed: [ki-vergleich.org]                    │
└──────────────────────────────────────────────────┘
                    ↓
         Crawl 1    Crawl 2
      (Browser 1) (Browser 2)

      Nach Completion:
      Crawl 3 startet automatisch
```

### Implementation (2-3 Stunden)
1. **Queue-Manager erstellen** (`scripts/queue-manager.js`)
   - `enqueueJob(url, priority=0)`
   - `processQueue()` – Loop mit Limits
   - Persistent in `data/queue.json`

2. **Memory-Cleanup**
   - Max 5 Screenshots pro Site
   - Browser nach Job killen
   - Jobs nach 1h aus RAM löschen

3. **API erweitern**
   - `POST /api/batch` – 26 URLs einreichen
   - `GET /api/queue` – Queue-Status
   - `GET /api/queue/:id/cancel` – Canceln

---

## 📈 Phase 2: SEO-Verbesserungen (Woche 1)

### Neue SEO-Checks (21 statt 11)
```javascript
{
  "seo_checks": {
    "meta_tags": {
      "title_tag": ✓,
      "meta_description": ✓,
      "viewport": ✓,
      "charset": ✓
    },
    "structured_data": {
      "json_ld": ✗ "Missing",
      "microdata": ✓,
      "rdfa": ✓
    },
    "social_media": {
      "og_title": ✓,
      "og_image": ✓,
      "twitter_card": ✗ "Missing"
    },
    "content": {
      "heading_hierarchy": ✓,
      "alt_text": ⚠ "5 images ohne alt",
      "internal_links": ✓,
      "anchor_text_quality": ⚠ "9x 'click here'"
    },
    "technical": {
      "canonical_tag": ✓,
      "hreflang": ✗ "Not needed",
      "robots_txt": ✓,
      "sitemap_xml": ✓
    }
  }
}
```

### SEO-Score neu gewichtet
```
Meta Tags (5 checks):        20%
Structured Data (3 checks):  15%
Content Quality (5 checks):  30%
Technical SEO (5 checks):    20%
Performance (3 checks):      15%
────────────────────────────────
Total: 21 Checks = 100%
```

---

## 📱 Phase 3: Mobile-Optimierungen (Woche 1-2)

### Erweiterte Mobile-Tests
```javascript
{
  "mobile_audits": {
    "viewport_tests": {
      "375px (iPhone)": { score: 68, issues: [...] },
      "768px (Tablet)": { score: 78, issues: [...] },
      "1024px (iPad)": { score: 82, issues: [...] }
    },
    "usability": {
      "touch_targets": ⚠ "3 buttons < 44px",
      "font_size": ✓ "All ≥ 16px on mobile",
      "form_inputs": ✓ "All optimized",
      "burger_menu": ✓ "Working"
    },
    "performance": {
      "largest_contentful_paint": "2.1s",
      "first_input_delay": "45ms",
      "cumulative_layout_shift": "0.08"
    }
  }
}
```

### Lighthouse Integration
```javascript
// Automatisch prüfen via Playwright
const lighthouse = require('lighthouse')

mobile_score = (
  pagespeed_score * 0.4 +
  mobile_usability * 0.3 +
  core_web_vitals * 0.3
)
```

---

## 🎯 Priorisierte Checklist

### Morgen (3-4h)
- [ ] `scripts/queue-manager.js` schreiben
- [ ] `server.js` Queue-Integration
- [ ] `data/queue.json` Schema
- [ ] Tests: 2 Crawls parallel

### Woche 1 (10h)
- [ ] 10 neue SEO-Checks
- [ ] Mobile-Viewport-Tests (3 Größen)
- [ ] Lighthouse-Anbindung
- [ ] Batch-UI für Dashboard

### Woche 2 (5h)
- [ ] Queue-Status-Dashboard
- [ ] Report-Aggregation
- [ ] Vergleichs-Features
- [ ] Tests alle 26 Projekte

---

## 📊 Queue-Datenstruktur

```json
{
  "queue": {
    "pending": [
      { "id": "q_001", "url": "https://ai2go.runitfast.xyz", "priority": 10, "created": "2026-03-23T10:00:00Z" },
      { "id": "q_002", "url": "https://dreamedit.runitfast.xyz", "priority": 5, "created": "2026-03-23T10:05:00Z" }
    ],
    "running": [
      { "id": "q_003", "url": "https://transkriptor.runitfast.xyz", "started": "2026-03-23T10:10:00Z", "progress": 45 },
      { "id": "q_004", "url": "https://shader.runitfast.xyz", "started": "2026-03-23T10:12:00Z", "progress": 20 }
    ],
    "completed": [
      { "id": "q_005", "url": "https://ki-vergleich.org", "completed": "2026-03-23T10:35:00Z", "duration": 25 }
    ]
  }
}
```

---

## 📁 Neue Files

```
scripts/
├── queue-manager.js         ← Zentrale Queue-Logik
├── seo-v2.js               ← Erweiterte SEO-Checks
└── mobile-v2.js            ← Erweiterte Mobile-Tests

data/
├── queue.json              ← Persistent Queue

public/
├── queue-panel.js          ← Queue-UI Component
└── batch-audit.js          ← Batch-Audit UI
```

---

## 🧪 Test-Strategie

```
Phase 1: Queue-Stabilität
  Test 1: 2 parallele Crawls → 5 min
  Test 2: Queue mit 10 Jobs → 30 min

Phase 2: SEO-Features
  Test 3: SEO-Checks auf 26 Seiten → 1h

Phase 3: Mobile-Features
  Test 4: Mobile auf 3 Viewports → 30 min
  Test 5: Lighthouse auf 10 Sites → 15 min

Phase 4: Vollständiger Batch
  Test 6: Alle 26 Vercel-Projekte → 3 hours
  Metrics: RAM < 1GB, CPU < 80%, Disk-IO smooth
```

---

## 💾 Verbrauchte Ressourcen (Vorab-Schätzung)

| Phase | Task | Zeit | Status |
|-------|------|------|--------|
| 1 | Queue-Manager | 2h | Morgen |
| 1 | Memory-Cleanup | 1.5h | Morgen |
| 1 | API-Integration | 1.5h | Morgen |
| 2 | 10 SEO-Checks | 3h | Woche 1 |
| 2 | SEO-UI | 1.5h | Woche 1 |
| 3 | Mobile-Tests | 2.5h | Woche 1 |
| 3 | Lighthouse | 2h | Woche 1 |
| 4 | Queue-Dashboard | 2h | Woche 2 |
| 4 | Batch-UI | 1.5h | Woche 2 |
| 4 | Testing | 2h | Woche 2 |
| **Total** | | **19h** | **2 Wochen** |

