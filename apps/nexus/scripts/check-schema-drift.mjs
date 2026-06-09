#!/usr/bin/env node
// ============================================================
// Schema-drift check (T2)
// ============================================================
// Catches the class of bug where application SQL references a table/column
// that the D1 migrations never create — e.g. selecting `model_used` from
// `workflow_steps` when the column is actually `ai_model_used`. That kind of
// drift compiles fine in TypeScript and only blows up at runtime as
// "D1_ERROR: no such column: ...", which is exactly how the /observability
// page broke.
//
// How it works:
//   1. Apply every migration in ../migrations to an in-memory SQLite DB.
//   2. Scan the worker's route/service source for SQL string literals.
//   3. prepare() each one. SQLite resolves table + column names at prepare
//      time, so a missing column/table throws immediately.
//   4. Fail the build ONLY on "no such column" / "no such table" errors.
//      Syntax errors from dynamically-assembled SQL fragments are ignored on
//      purpose so the check stays low-noise and self-maintaining (no manual
//      list of queries to keep in sync).
//
// Engine: prefers better-sqlite3 (installed ad-hoc in CI), then node:sqlite
// (Node >= 22.5), then bun:sqlite (so `bun scripts/check-schema-drift.mjs`
// works locally). Any real SQLite build is fine — the migrations are plain
// SQLite DDL.
// ============================================================
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const NEXUS_ROOT = join(__dirname, '..')
const MIGRATIONS_DIR = join(NEXUS_ROOT, 'migrations')
const SCAN_DIRS = [join(NEXUS_ROOT, 'apps', 'nexus-api', 'src')]
const BASELINE_FILE = join(__dirname, 'schema-drift-baseline.json')

// Load the documented baseline of known, prod-tolerated drift. A finding is
// only a failure when its missing identifier is NOT in this set — so the
// check still catches any NEW drift while not blocking on the pre-existing
// out-of-band columns. Strip table-alias prefixes (`p.deliverable_url`
// → `deliverable_url`) before comparing.
function loadBaseline() {
  try {
    const json = JSON.parse(readFileSync(BASELINE_FILE, 'utf8'))
    return new Set((json.tolerated_missing ?? []).map((e) => e.name))
  } catch {
    return new Set()
  }
}
const bareName = (id) => id.includes('.') ? id.split('.').pop() : id

async function loadEngine() {
  // better-sqlite3 (CI installs this ad-hoc)
  try {
    const mod = await import('better-sqlite3')
    const Database = mod.default ?? mod
    const db = new Database(':memory:')
    return { name: 'better-sqlite3', exec: (s) => db.exec(s), prepare: (s) => db.prepare(s) }
  } catch {}
  // node:sqlite (Node >= 22.5)
  try {
    const { DatabaseSync } = await import('node:sqlite')
    const db = new DatabaseSync(':memory:')
    return { name: 'node:sqlite', exec: (s) => db.exec(s), prepare: (s) => db.prepare(s) }
  } catch {}
  // bun:sqlite (local runs under bun)
  try {
    const { Database } = await import('bun:sqlite')
    const db = new Database(':memory:')
    return { name: 'bun:sqlite', exec: (s) => db.exec(s), prepare: (s) => db.prepare(s) }
  } catch {}
  return null
}

function listFiles(dir, out = []) {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue
      listFiles(full, out)
    } else if (/\.ts$/.test(entry.name) && !/\.d\.ts$/.test(entry.name)) {
      out.push(full)
    }
  }
  return out
}

// Pull string literals (backtick, single, double) that look like SQL DML.
const SQL_START = /\b(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM)\b/i
const REFERENCES_TABLE = /\b(FROM|INTO|UPDATE|JOIN)\s+[a-zA-Z_]/i

function extractSqlLiterals(source) {
  const out = []
  // Backtick template literals (most multi-line queries use these).
  for (const m of source.matchAll(/`([^`]*)`/g)) {
    out.push(m[1])
  }
  // Single/double-quoted single-line queries (e.g. 'SELECT status, COUNT(*) ...').
  for (const m of source.matchAll(/'([^'\n]*)'/g)) out.push(m[1])
  for (const m of source.matchAll(/"([^"\n]*)"/g)) out.push(m[1])
  return out.filter((s) => SQL_START.test(s) && REFERENCES_TABLE.test(s))
}

// Neutralise ${...} interpolations so the statement can be prepared. We can't
// validate an interpolated column/table name, but neutralising lets us still
// validate the static parts of the query.
function neutralise(sql) {
  return sql
    .replace(/\$\{[^}]*\}/g, 'NULL') // template interpolation -> NULL
    .trim()
}

const DRIFT_RE = /no such (column|table)/i

async function main() {
  const engine = await loadEngine()
  if (!engine) {
    console.error(
      '✖ No SQLite engine available. Install one (e.g. `npm i better-sqlite3`) ' +
        'or run under Node >= 22.5 / bun.',
    )
    process.exit(1)
  }

  // 1. Apply migrations in order.
  const migrations = readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d.*\.sql$/.test(f))
    .sort()
  let applied = 0
  engine.exec('PRAGMA foreign_keys=OFF;')
  for (const f of migrations) {
    try {
      engine.exec(readFileSync(join(MIGRATIONS_DIR, f), 'utf8'))
      applied++
    } catch (e) {
      console.error(`✖ Migration failed to apply: ${f}\n  ${e.message}`)
      process.exit(1)
    }
  }

  // 2 + 3. Scan source and prepare each query.
  const baseline = loadBaseline()
  const files = SCAN_DIRS.flatMap((d) => listFiles(d))
  const failures = [] // NEW drift — fails the build
  const baselined = [] // known, prod-tolerated drift — reported only
  let checked = 0
  let skipped = 0

  const missingId = (msg) => {
    const m = msg.match(/no such (?:column|table):\s*([a-zA-Z0-9_.]+)/i)
    return m ? bareName(m[1]) : null
  }

  for (const file of files) {
    const src = readFileSync(file, 'utf8')
    for (const raw of extractSqlLiterals(src)) {
      const sql = neutralise(raw)
      if (/\$\{|\bNULL\b.*\bNULL\b/.test(raw) && !SQL_START.test(sql)) {
        skipped++
        continue
      }
      try {
        engine.prepare(sql)
        checked++
      } catch (e) {
        if (DRIFT_RE.test(e.message)) {
          const id = missingId(e.message)
          const rec = { file: relative(NEXUS_ROOT, file), sql: sql.replace(/\s+/g, ' ').slice(0, 160), message: e.message, id }
          if (id && baseline.has(id)) baselined.push(rec)
          else failures.push(rec)
        } else {
          // Syntax error from a dynamic fragment, etc. — not drift.
          skipped++
        }
      }
    }
  }

  console.log(
    `Schema-drift check (${engine.name}): applied ${applied} migrations, ` +
      `checked ${checked} queries, skipped ${skipped}, ` +
      `${baselined.length} known/baselined.`,
  )

  if (failures.length) {
    console.error(`\n✖ NEW schema drift detected in ${failures.length} quer${failures.length === 1 ? 'y' : 'ies'}:\n`)
    for (const f of failures) {
      console.error(`  ${f.file}`)
      console.error(`    ${f.message}`)
      console.error(`    → ${f.sql}\n`)
    }
    console.error(
      'A query references a table/column the migrations do not create.\n' +
        'Fix the query, or add the column/table in a migration. If it exists in\n' +
        'prod out-of-band and must be tolerated, add it to scripts/schema-drift-baseline.json\n' +
        '(with justification) — but prefer fixing the schema.',
    )
    process.exit(1)
  }

  console.log(`✓ No new schema drift. ${baselined.length} known pre-existing item(s) tolerated via baseline.`)
}

main().catch((e) => {
  console.error('check-schema-drift crashed:', e)
  process.exit(1)
})
