# 🚀 Quick Start: Queue-System

## 5-Minuten Setup

### Terminal 1: Server starten
```bash
cd c:\CODE\GIT\Projekte-Claude\Sitechecker
npm start
```

**Expected Output:**
```
[server] Website Doctor v1.0.1 läuft auf http://localhost:3001
[queue] Initialized: 0 pending, 0 running
[queue] MAX_CONCURRENT_CRAWLS: 2
```

### Terminal 2: 26 Vercel-Projekte laden
```bash
cd c:\CODE\GIT\Projekte-Claude\Sitechecker
node load-vercel-queue.js
```

**Expected Output:**
```
📊 Lade 26 Vercel-Projekte in Queue...

✅ Batch eingereiht!
   Batch ID: 1774291167836
   Jobs: 26
   Queue-Position: 26

💡 Monitoring starten mit: node test-queue.js
   Oder öffne: http://localhost:3001
```

### Terminal 3 (optional): Live-Monitoring
```bash
# Option A: Alle 5 Sekunden Refresh
while true; do
  echo "=== Queue Status ==="
  curl -s http://localhost:3001/api/queue | grep -E '"pending"|"running"|"completed"'
  echo ""
  sleep 5
done

# Option B: Better Monitoring (wenn jq installiert)
watch -n 5 'curl -s http://localhost:3001/api/queue | jq ".pending, .running, .completed"'
```

---

## 📊 Was passiert jetzt?

```
Queue-Status nach Start:
{
  "pending": 26,     ← Alle warten
  "running": 0,      ← Noch nicht gestartet
  "completed": 0
}

Nach ~30 Sekunden:
{
  "pending": 24,     ← 2 haben angefangen
  "running": 2,      ← Job 1 + Job 2 crawlen
  "completed": 0
}

Nach 8 Minuten:
{
  "pending": 23,     ← 1 neuer Job startet
  "running": 2,      ← Crawl 1 & 2 noch aktiv
  "completed": 1     ← 1 Job fertig
}
```

---

## ⏱️ Timing

| Aktion | Zeit |
|--------|------|
| 2 URLs parallel | 6-8 min |
| 26 URLs (mit MAX_CONCURRENT=2) | ~3 Stunden |
| **Total Runtime** | ~3h (unbeaufsichtigt) |

---

## 🔍 Reports abrufen

```bash
# Batch-Ergebnisse abrufen
curl http://localhost:3001/api/batch/1774291167836 | grep -E '"url"|"score"'

# Single Report
curl http://localhost:3001/report/q_1774291167837_1uasylb

# PDF exportieren
curl http://localhost:3001/export-pdf/q_1774291167837_1uasylb > report.pdf
```

---

## 🛑 Job canceln (falls nötig)

```bash
# Nächsten Job in Queue entfernen
curl -X DELETE http://localhost:3001/api/queue/q_1774291167837_h7ugphj

# Alle Reports anschauen
curl http://localhost:3001/history | jq ".[] | {url, score, date}"
```

---

## 📈 Fortschritt tracken

```bash
# Wie viele sind fertig?
curl -s http://localhost:3001/api/queue | grep completed

# Welche URLs laufen gerade?
curl -s http://localhost:3001/api/queue | grep '"url"'

# Nächster in Queue?
curl -s http://localhost:3001/api/queue | grep pending
```

---

## 🎯 Das wars!

Jetzt crawlt das System automatisch alle 26 Vercel-Projekte mit maximal 2 gleichzeitigen Crawls.

**Keine Systemüberlastung mehr!** 🎉

