import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Dynamic SQLite engine loader
async function loadEngine() {
  // node:sqlite (Node >= 22.5)
  try {
    const { DatabaseSync } = await import('node:sqlite')
    const db = new DatabaseSync(':memory:')
    return { name: 'node:sqlite', exec: (s: string) => db.exec(s), all: (s: string, params: any[] = []) => db.prepare(s).all(...params) }
  } catch {}
  // better-sqlite3
  try {
    const mod = await import('better-sqlite3')
    const Database = mod.default ?? mod
    const db = new Database(':memory:')
    return { name: 'better-sqlite3', exec: (s: string) => db.exec(s), all: (s: string, params: any[] = []) => db.prepare(s).all(params) }
  } catch {}
  return null
}

const EXPECTED_SCHEMAS: Record<string, string[]> = {
  agent_tasks: [
    'id', 'type', 'status', 'payload', 'result', 'error',
    'estimated_cost_usd', 'actual_cost_usd', 'model_used',
    'input_tokens', 'output_tokens', 'agent_id', 'origin',
    'parent_task_id', 'created_at', 'updated_at', 'started_at',
    'finished_at', 'duration_ms'
  ],
  task_events: ['id', 'task_id', 'event_type', 'message', 'created_at'],
  agent_messages: ['id', 'task_id', 'sender', 'content', 'created_at'],
  approval_requests: [
    'id', 'task_id', 'action_type', 'risk_level', 'status',
    'created_at', 'resolved_at', 'feedback'
  ],
  artifacts: ['id', 'task_id', 'kind', 'url', 'content', 'created_at'],
  live_processes: ['id', 'task_id', 'name', 'status', 'created_at'],
  notifications: ['id', 'type', 'title', 'message', 'read', 'created_at']
}

function parseTsUnions(typesContent: string): Record<string, string[]> {
  const unions: Record<string, string[]> = {}
  const lines = typesContent.split('\n')

  // Parse AgentTaskType
  let inTaskType = false
  const taskTypes: string[] = []
  for (const line of lines) {
    if (line.includes('export type AgentTaskType =')) {
      inTaskType = true
      continue
    }
    if (inTaskType) {
      if (!line.trim() || line.trim().startsWith('export') || line.trim().startsWith('/**') || line.trim().startsWith('//')) {
        inTaskType = false
        continue
      }
      const match = line.match(/'([^']+)'/)
      if (match) {
        taskTypes.push(match[1])
      }
    }
  }
  unions['agent_tasks.type'] = taskTypes

  // Parse AgentTaskStatus
  const taskStatusLine = lines.find(l => l.includes('export type AgentTaskStatus ='))
  if (taskStatusLine) {
    const match = taskStatusLine.match(/'([^']+)'/g)
    if (match) {
      unions['agent_tasks.status'] = match.map(m => m.replace(/'/g, ''))
    }
  }

  // Parse ApprovalRequest.riskLevel & status
  let inApprovalRequest = false
  const riskLevels: string[] = []
  const approvalStatuses: string[] = []
  for (const line of lines) {
    if (line.includes('export interface ApprovalRequest')) {
      inApprovalRequest = true
      continue
    }
    if (inApprovalRequest) {
      if (line.includes('}')) {
        inApprovalRequest = false
        continue
      }
      const riskMatch = line.match(/riskLevel\??:\s*([^;\n]+)/)
      if (riskMatch) {
        riskLevels.push(...[...riskMatch[1].matchAll(/'([^']+)'/g)].map(m => m[1]))
      }
      const statusMatch = line.match(/status\??:\s*([^;\n]+)/)
      if (statusMatch) {
        approvalStatuses.push(...[...statusMatch[1].matchAll(/'([^']+)'/g)].map(m => m[1]))
      }
    }
  }
  unions['approval_requests.risk_level'] = riskLevels
  unions['approval_requests.status'] = approvalStatuses

  // Parse LiveProcess.status
  let inLiveProcess = false
  const liveStatuses: string[] = []
  for (const line of lines) {
    if (line.includes('export interface LiveProcess')) {
      inLiveProcess = true
      continue
    }
    if (inLiveProcess) {
      if (line.includes('}')) {
        inLiveProcess = false
        continue
      }
      const statusMatch = line.match(/status\??:\s*([^;\n]+)/)
      if (statusMatch) {
        liveStatuses.push(...[...statusMatch[1].matchAll(/'([^']+)'/g)].map(m => m[1]))
      }
    }
  }
  unions['live_processes.status'] = liveStatuses

  return unions
}

function extractSqlChecks(tableSql: string): Record<string, string[]> {
  const checks: Record<string, string[]> = {}
  const regex = /CHECK\s*\(\s*([a-zA-Z_0-9]+)\s+IN\s*\(([^)]+)\)\)/gi
  let match
  while ((match = regex.exec(tableSql)) !== null) {
    const colName = match[1].toLowerCase()
    const values = [...match[2].matchAll(/'([^']+)'/g)].map(m => m[1])
    checks[colName] = values
  }
  return checks
}

async function main() {
  const engine = await loadEngine()
  if (!engine) {
    console.error('❌ No SQLite engine available. Node.js >= 22.5 is required, or better-sqlite3 must be installed.')
    process.exit(1)
  }
  console.log(`ℹ️  Running schema check with SQLite engine: ${engine.name}`)

  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const migrationsDir = join(repoRoot, 'apps', 'nexus', 'migrations')
  const typesFile = join(repoRoot, 'packages', 'types', 'src', 'index.ts')

  if (!existsSync(migrationsDir)) {
    console.error(`❌ Migrations directory not found at ${migrationsDir}`)
    process.exit(1)
  }

  if (!existsSync(typesFile)) {
    console.error(`❌ Types file not found at ${typesFile}`)
    process.exit(1)
  }

  // 1. Apply all migrations in order
  const files = readdirSync(migrationsDir)
    .filter(f => /^\d.*\.sql$/.test(f))
    .sort()

  engine.exec('PRAGMA foreign_keys=OFF;')
  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), 'utf8')
    try {
      engine.exec(sql)
    } catch (err: any) {
      console.error(`❌ Migration failed to apply: ${file}`)
      console.error(`   ${err.message}`)
      process.exit(1)
    }
  }
  console.log(`✅ Applied ${files.length} D1 migrations to local in-memory SQLite database successfully.`)

  let hasErrors = false

  // 2. Verify tables and columns exist
  console.log('ℹ️  Verifying control-plane table schemas...')
  for (const [tableName, expectedCols] of Object.entries(EXPECTED_SCHEMAS)) {
    // Check if table exists
    const tables = engine.all("SELECT name FROM sqlite_master WHERE type='table' AND name=?", [tableName])
    if (tables.length === 0) {
      console.error(`❌ Missing Table: '${tableName}' does not exist in schema.`)
      hasErrors = true
      continue
    }

    // Check columns
    const columnsInfo = engine.all(`PRAGMA table_info(${tableName})`) as any[]
    const actualCols = columnsInfo.map(c => c.name.toLowerCase())

    for (const expCol of expectedCols) {
      if (!actualCols.includes(expCol)) {
        console.error(`❌ Missing Column: Table '${tableName}' is missing column '${expCol}'.`)
        hasErrors = true
      }
    }
    console.log(`   ✓ Table '${tableName}' has all expected columns.`)
  }

  // 3. Verify TypeScript status unions match CHECK constraints
  console.log('ℹ️  Matching TypeScript status/type unions against SQL CHECK constraints...')
  const typesContent = readFileSync(typesFile, 'utf8')
  const tsUnions = parseTsUnions(typesContent)

  const checkTargets = [
    { table: 'agent_tasks', col: 'type', tsKey: 'agent_tasks.type' },
    { table: 'agent_tasks', col: 'status', tsKey: 'agent_tasks.status' },
    { table: 'approval_requests', col: 'risk_level', tsKey: 'approval_requests.risk_level' },
    { table: 'approval_requests', col: 'status', tsKey: 'approval_requests.status' },
    { table: 'live_processes', col: 'status', tsKey: 'live_processes.status' }
  ]

  for (const target of checkTargets) {
    // Get create table sql
    const schemaRows = engine.all("SELECT sql FROM sqlite_master WHERE type='table' AND name=?", [target.table]) as any[]
    if (schemaRows.length === 0) continue

    const sqlChecks = extractSqlChecks(schemaRows[0].sql)
    const sqlValues = sqlChecks[target.col]
    const tsValues = tsUnions[target.tsKey]

    if (!sqlValues) {
      console.error(`❌ SQL Constraint Missing: No CHECK constraint found for '${target.table}.${target.col}' in DDL.`)
      hasErrors = true
      continue
    }

    if (!tsValues) {
      console.error(`❌ TS Type Definition Missing: Could not find type union definition for '${target.tsKey}' in types file.`)
      hasErrors = true
      continue
    }

    // Compare values
    const missingInSql = tsValues.filter(v => !sqlValues.includes(v))
    const missingInTs = sqlValues.filter(v => !tsValues.includes(v))

    if (missingInSql.length > 0 || missingInTs.length > 0) {
      console.error(`❌ Type/Schema Mismatch on '${target.table}.${target.col}':`)
      if (missingInSql.length > 0) {
        console.error(`   - Defined in TypeScript but missing in SQLite CHECK constraint: ${JSON.stringify(missingInSql)}`)
      }
      if (missingInTs.length > 0) {
        console.error(`   - Defined in SQLite CHECK constraint but missing in TypeScript: ${JSON.stringify(missingInTs)}`)
      }
      hasErrors = true
    } else {
      console.log(`   ✓ '${target.table}.${target.col}' matches TypeScript union perfectly: ${JSON.stringify(tsValues)}`)
    }
  }

  if (hasErrors) {
    console.error('\n❌ D1 Migration smoke test failed. Schema drift or type inconsistencies detected.')
    process.exit(1)
  }

  console.log('\n✅ All D1 migrations smoke tests passed successfully!')
}

main().catch((e) => {
  console.error('check-d1-schema crashed:', e)
  process.exit(1)
})
