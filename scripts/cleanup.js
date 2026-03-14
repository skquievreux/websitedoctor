#!/usr/bin/env node
/**
 * cleanup.js — Bereinigt verwaiste Reports, Screenshots und History-Einträge
 *
 * Usage:
 *   node scripts/cleanup.js           # führt Cleanup durch
 *   node scripts/cleanup.js --dry-run # zeigt nur was gelöscht würde
 */

import { readFile, writeFile, unlink } from 'fs/promises'
import { existsSync, readdirSync, statSync } from 'fs'
import path from 'path'
import chalk from 'chalk'

const DRY_RUN = process.argv.includes('--dry-run')
const HISTORY_FILE = 'data/history.json'
const SCREENSHOTS_DIR = 'screenshots'
const REPORTS_DIR = 'reports'
const MAX_RUNS_PER_HOST = 3

if (DRY_RUN) console.log(chalk.yellow('[cleanup] DRY-RUN – keine Änderungen werden gespeichert\n'))

// ── 1. History laden ──────────────────────────────────────────────

const raw = await readFile(HISTORY_FILE, 'utf-8').catch(() => '[]')
const history = JSON.parse(raw)
console.log(chalk.cyan(`[cleanup] ${history.length} History-Einträge geladen`))

// ── 2. Verwaiste History-Einträge entfernen ───────────────────────

const activeHistory = history.filter(entry => {
  if (entry.reportPath && existsSync(entry.reportPath)) return true
  const legacyFile = `reports/legacy/report_${entry.id}.json`
  if (existsSync(legacyFile)) return true
  console.log(chalk.red(`  ✗ veraltet (kein Report-File): ${entry.id} – ${entry.hostname || entry.url}`))
  return false
})

const removedHistory = history.length - activeHistory.length
console.log(chalk.cyan(`[cleanup] ${removedHistory} verwaiste History-Einträge entfernt`))

// ── 3. Pro Hostname nur MAX_RUNS_PER_HOST behalten ───────────────

const byHost = {}
for (const entry of activeHistory) {
  const key = entry.hostname || entry.url
  if (!byHost[key]) byHost[key] = []
  byHost[key].push(entry)
}

const keptHistory = []
const deletedReports = []

for (const [host, entries] of Object.entries(byHost)) {
  // neueste zuerst (history ist bereits so sortiert, aber sicher ist sicher)
  const sorted = entries.sort((a, b) => b.id - a.id)
  const keep = sorted.slice(0, MAX_RUNS_PER_HOST)
  const drop = sorted.slice(MAX_RUNS_PER_HOST)

  keptHistory.push(...keep)

  for (const entry of drop) {
    console.log(chalk.red(`  ✗ alter Run (>${MAX_RUNS_PER_HOST} pro Host): ${entry.id} – ${host}`))
    if (entry.reportPath && existsSync(entry.reportPath)) {
      deletedReports.push(entry.reportPath)
    }
    const legacyFile = `reports/legacy/report_${entry.id}.json`
    if (existsSync(legacyFile)) deletedReports.push(legacyFile)
  }
}

console.log(chalk.cyan(`[cleanup] ${deletedReports.length} veraltete Report-Files markiert zum Löschen`))

// ── 4. Referenzierte Screenshot-Pfade aus aktiven Reports sammeln ─

const referencedScreenshots = new Set()

for (const entry of keptHistory) {
  try {
    let reportData = null
    if (entry.reportPath && existsSync(entry.reportPath)) {
      reportData = JSON.parse(await readFile(entry.reportPath, 'utf-8'))
    } else {
      const legacyFile = `reports/legacy/report_${entry.id}.json`
      if (existsSync(legacyFile)) {
        reportData = JSON.parse(await readFile(legacyFile, 'utf-8'))
      }
    }
    if (!reportData) continue

    for (const page of reportData.pages ?? []) {
      if (page.screenshotPath) referencedScreenshots.add(page.screenshotPath)
    }
    for (const page of reportData.mobile?.pages ?? []) {
      if (page.screenshotPath) referencedScreenshots.add(page.screenshotPath)
    }
    for (const page of reportData.seo?.pages ?? []) {
      const mainPage = reportData.pages?.find(p => p.url === page.url)
      if (mainPage?.screenshotPath) referencedScreenshots.add(mainPage.screenshotPath)
    }
  } catch { /* defekter Report – überspringen */ }
}

// ── 5. Verwaiste Screenshots identifizieren ───────────────────────

const allScreenshots = existsSync(SCREENSHOTS_DIR)
  ? readdirSync(SCREENSHOTS_DIR)
      .filter(f => f.endsWith('.png'))
      .map(f => `${SCREENSHOTS_DIR}/${f}`)
  : []

const orphanedScreenshots = allScreenshots.filter(f => !referencedScreenshots.has(f))
console.log(chalk.cyan(`[cleanup] ${allScreenshots.length} Screenshots gesamt, ${orphanedScreenshots.length} verwaist`))

// ── 6. Ausführen ──────────────────────────────────────────────────

if (!DRY_RUN) {
  // Report-Dateien löschen
  for (const f of deletedReports) {
    await unlink(f).catch(() => {})
    console.log(chalk.gray(`  gelöscht: ${f}`))
  }

  // Verwaiste Screenshots löschen
  for (const f of orphanedScreenshots) {
    await unlink(f).catch(() => {})
    console.log(chalk.gray(`  gelöscht: ${f}`))
  }

  // History speichern (neueste zuerst)
  const finalHistory = keptHistory.sort((a, b) => b.id - a.id)
  await writeFile(HISTORY_FILE, JSON.stringify(finalHistory, null, 2))
  console.log(chalk.green(`\n[cleanup] Fertig — History auf ${finalHistory.length} Einträge bereinigt`))
} else {
  console.log(chalk.yellow(`\n[cleanup] DRY-RUN abgeschlossen`))
  console.log(chalk.yellow(`  würde löschen: ${deletedReports.length} Reports, ${orphanedScreenshots.length} Screenshots`))
  console.log(chalk.yellow(`  würde behalten: ${keptHistory.length} History-Einträge`))
  if (orphanedScreenshots.length) {
    console.log(chalk.yellow('\n  Verwaiste Screenshots:'))
    orphanedScreenshots.forEach(f => console.log(chalk.gray(`    ${f}`)))
  }
}
