# 🚀 Sitechecker Optimization & Feature Plan – Zusammenfassung

## 📋 Situation
- **Problem:** 26 Vercel-Projekte sollen geprüft werden
- **Fehler:** Versuch, alle parallel zu crawlen → System-Crash
- **Lösung:** Queue-basiertes System mit limitierten parallelen Crawls

---

## ✅ Was ich gemacht habe

### 1. **Audit-Queue erstellt** (`data/audit-queue.json`)
- ✓ Alle 26 öffentlichen Vercel-Projekte dokumentiert
- ✓ Prioritäten zugewiesen (hugo-publisher, ai2go, dream-edit höchste Priorität)
- ✓ Struktur: pending, running, completed, failed
- ✓ Estimated Duration: **~3 Stunden** mit `MAX_CONCURRENT_CRAWLS = 2`

### 2. **Feature Roadmap geschrieben** (`docs/FEATURE_ROADMAP.md`)
- ✓ 3-Phasen-Plan
- ✓ Implementierungs-Reihenfolge
- ✓ Zeitschätzungen
- ✓ Test-Strategie

### 3. **Optimization Plan dokumentiert** (Memory)
- ✓ System-Stabilität (Queue, Memory-Cleanup)
- ✓ SEO-Verbesserungen (21 Checks statt 11)
- ✓ Mobile-Optimierungen (Viewport-Tests, Lighthouse)
- ✓ UI-Upgrades (Queue-Dashboard, Batch-Audit)

---

## 🎯 Implementierungs-Reihenfolge

### **Phase 1: MORGEN – System-Stabilität (3-4 Stunden)**
```
Priority: CRITICAL – Ohne das crasht das System wieder
```

| # | Task | Zeit | Files |
|---|------|------|-------|
| 1 | Queue-Manager implementieren | 2h | `scripts/queue-manager.js` |
| 2 | Memory-Leaks beheben | 1.5h | `scripts/crawl-worker.js`, `server.js` |
| 3 | Test: 2 parallele Crawls | 1.5h | Manual Test |

**Output:** System kann 26 Projekte mit `MAX_CONCURRENT_CRAWLS=2` stabil handhaben

---

### **Phase 2: WOCHE 1 – Feature-Entwicklung (10 Stunden)**
```
Priority: HIGH – Neue Features für bessere Audit-Qualität
```

#### A) SEO-Verbesserungen
```javascript
// 11 → 21 Checks
NEUE Checks hinzufügen:
✓ JSON-LD Structured Data
✓ OpenGraph Tags (og:title, og:image)
✓ Twitter Cards
✓ Canonical Tags
✓ hreflang Tags
✓ Alt-Text Vollständigkeit
✓ Link-Anchor-Text Qualität
✓ Heading Hierarchy
✓ Internal Link Structure
✓ Image Optimization
```

#### B) Mobile-Optimierungen
```javascript
// 3x Viewport-Tests
✓ iPhone (375px)
✓ Tablet (768px)
✓ iPad (1024px)

// Usability-Checks
✓ Touch-Target-Größen (44x44px min)
✓ Font-Size (16px min auf Mobile)
✓ Responsive Images (srcset)
✓ Lighthouse Integration (PageSpeed)
```

---

### **Phase 3: WOCHE 2 – UI & Testing (7 Stunden)**
```
Priority: MEDIUM – Bessere User Experience
```

| Task | Zeit | UI-Element |
|------|------|-----------|
| Queue-Dashboard | 2h | Status-Panel mit Real-time Updates |
| Batch-Audit UI | 1.5h | Multi-Select + "Start Batch" Button |
| Report-Aggregation | 1.5h | Cross-Site Vergleiche |
| Testing (26 Projekte) | 2h | Full-Run Test |

---

## 📊 Queue-Verwaltung

### Datenstruktur
```json
{
  "queue": {
    "pending": [26 Jobs],      // Warten
    "running": [max 2 Jobs],   // Aktiv
    "completed": [],           // Fertig
    "failed": []               // Fehler
  },
  "settings": {
    "max_concurrent_crawls": 2,
    "estimated_duration": "180 minutes"
  }
}
```

### API-Endpunkte (neu)
```bash
# Batch einreichen
POST /api/batch { urls: [...] }
→ Returns: { batch_id, queue_position }

# Queue-Status
GET /api/queue
→ Returns: { pending: 24, running: 2, completed: 1 }

# Einzelnen Job canceln
DELETE /api/queue/:job_id
→ Returns: { status: 'cancelled' }

# Alle Reports eines Batches
GET /api/batch/:batch_id/reports
→ Returns: { reports: [...], aggregated_score: 71 }
```

---

## 🧪 Test-Plan

### Test 1: Queue-Stabilität (Morgen)
```bash
# 2 Crawls starten
npm test -- --suite queue-stability
→ Sollte RAM < 500MB verbrauchen
→ Sollte ~6-8 Minuten dauern
```

### Test 2: 26-Projekt-Batch (Freitag)
```bash
# Alle 26 Vercel-Projekte einmal durchlaufen
curl -X POST http://localhost:3001/api/batch \
  -H "Content-Type: application/json" \
  -d @data/audit-queue.json

# Monitoring:
# - RAM-Nutzung (sollte < 1GB bleiben)
# - CPU (sollte < 80% sein)
# - Duration (sollte ~3h sein)
```

### Test 3: New Features (nächste Woche)
```bash
# SEO-Checks auf 5 Sites validieren
# Mobile-Tests auf 3 Viewports validieren
# Lighthouse-Integration testen
```

---

## 📁 Dateistruktur (neu)

```
Sitechecker/
├── data/
│   ├── audit-queue.json         ← NEU: Alle 26 Projekte
│   ├── queue.json               ← NEU: Current Queue State
│   ├── history.json             ← EXISTING
│   └── webhooks.json            ← EXISTING
│
├── scripts/
│   ├── queue-manager.js         ← NEU: Queue-Logik
│   ├── seo-v2.js                ← NEU: 21 Checks
│   ├── mobile-v2.js             ← NEU: Viewport-Tests
│   ├── crawl.js                 ← MODIFY: Memory-Cleanup
│   ├── crawl-worker.js          ← MODIFY: Browser-Limits
│   └── ...
│
├── public/
│   ├── queue-panel.js           ← NEU: Queue-UI Component
│   ├── batch-audit.js           ← NEU: Batch-Start UI
│   └── ...
│
├── docs/
│   ├── FEATURE_ROADMAP.md       ← NEU: Dieser Plan
│   └── ...
│
└── server.js                    ← MODIFY: Queue-Integration
```

---

## 💰 Ressourcen-Budget

| Phase | Zeit | Komplexität | Status |
|-------|------|------------|--------|
| 1. Queue + Memory | 3-4h | ⚠️ HIGH | Morgen |
| 2. SEO + Mobile | 10h | 🟡 MEDIUM | Woche 1 |
| 3. UI + Testing | 7h | 🟢 LOW | Woche 2 |
| **Total** | **20h** | | **2 Wochen** |

---

## 🚦 Start-Strategie

### Morgen (Max 4h Fokus)
1. **9:00** – Starte Queue-Manager Implementierung
2. **11:00** – Memory-Leak Fixes
3. **13:00** – Test mit 2 Crawls
4. **14:00** – Done! System ist stabil

### Danach (asynchron)
- Starte 2-3 Queue-Jobs täglich
- Doku aktualisieren
- SEO/Mobile Features entwickeln

---

## 📈 Success-Kriterien

✅ **Phase 1 erfolgreich wenn:**
- [ ] Queue-System läuft stabil
- [ ] 2 Crawls parallel ohne RAM-Spike
- [ ] 26 Projekte ohne Crash durchlaufen

✅ **Phase 2 erfolgreich wenn:**
- [ ] 21 SEO-Checks implementiert & getestet
- [ ] Mobile-Tests auf 3 Viewports
- [ ] Lighthouse-Scores visible

✅ **Phase 3 erfolgreich wenn:**
- [ ] Queue-Dashboard nutzbar
- [ ] Batch-Audit-UI funktioniert
- [ ] Alle 26 Reports vergleichbar

---

## 🎯 Next Step: Jetzt machen?

Die **audit-queue.json** ist ready. Sobald die Phase-1-Implementierung (Queue-Manager) fertig ist, können wir anfangen:

```bash
# Queue-Job starten
POST /api/batch < data/audit-queue.json
```

Das System wird dann langsam (aber sicher!) alle 26 Projekte durcharbeiten.

