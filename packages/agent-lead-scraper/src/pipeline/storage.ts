/**
 * CRM-lite storage for scored leads.
 *
 *   InMemoryLeadStore — tests + dry runs.
 *   D1LeadStore       — backs onto migration 027 (`leads` table).
 */

import type { IntentLevel, Lead, LeadStore } from '../types'

export class InMemoryLeadStore implements LeadStore {
  private rows = new Map<string, Lead>()

  async upsert(lead: Lead): Promise<{ inserted: boolean }> {
    const had = this.rows.has(lead.fingerprint)
    this.rows.set(lead.fingerprint, lead)
    return { inserted: !had }
  }

  async list(opts?: { limit?: number; intent?: IntentLevel }): Promise<Lead[]> {
    let arr = [...this.rows.values()]
    if (opts?.intent) arr = arr.filter((l) => l.score.intent === opts.intent)
    arr.sort((a, b) => b.score.total - a.score.total)
    return arr.slice(0, opts?.limit ?? 50)
  }
}

interface D1Like {
  prepare(sql: string): {
    bind(...args: unknown[]): {
      run(): Promise<unknown>
      all<T = unknown>(): Promise<{ results?: T[] }>
      first<T = unknown>(): Promise<T | null>
    }
  }
}

interface LeadRow {
  fingerprint: string
  source: string
  source_id: string
  author: string
  author_bio: string | null
  text: string
  url: string
  posted_at: string
  matched_terms: string
  extra: string | null
  score_total: number
  score_intent: string
  score_components: string
  suggested_reply: string | null
  created_at: string
}

function rowToLead(r: LeadRow): Lead {
  return {
    source: r.source as Lead['source'],
    source_id: r.source_id,
    author: r.author,
    author_bio: r.author_bio ?? undefined,
    text: r.text,
    url: r.url,
    posted_at: r.posted_at,
    matched_terms: JSON.parse(r.matched_terms),
    extra: r.extra ? JSON.parse(r.extra) : undefined,
    score: {
      total: r.score_total,
      intent: r.score_intent as Lead['score']['intent'],
      components: JSON.parse(r.score_components),
    },
    suggested_reply: r.suggested_reply,
    fingerprint: r.fingerprint,
  }
}

export class D1LeadStore implements LeadStore {
  constructor(private db: D1Like) {}

  async upsert(lead: Lead): Promise<{ inserted: boolean }> {
    const existing = await this.db
      .prepare(`SELECT fingerprint FROM leads WHERE fingerprint = ?`)
      .bind(lead.fingerprint)
      .first<{ fingerprint: string }>()
    await this.db
      .prepare(
        `INSERT OR REPLACE INTO leads (
           fingerprint, source, source_id, author, author_bio, text, url,
           posted_at, matched_terms, extra, score_total, score_intent,
           score_components, suggested_reply, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM leads WHERE fingerprint = ?), datetime('now')))`,
      )
      .bind(
        lead.fingerprint,
        lead.source,
        lead.source_id,
        lead.author,
        lead.author_bio ?? null,
        lead.text,
        lead.url,
        lead.posted_at,
        JSON.stringify(lead.matched_terms),
        lead.extra ? JSON.stringify(lead.extra) : null,
        lead.score.total,
        lead.score.intent,
        JSON.stringify(lead.score.components),
        lead.suggested_reply,
        lead.fingerprint,
      )
      .run()
    return { inserted: !existing }
  }

  async list(opts?: { limit?: number; intent?: IntentLevel }): Promise<Lead[]> {
    const where = opts?.intent ? `WHERE score_intent = ?` : ''
    const binds: unknown[] = []
    if (opts?.intent) binds.push(opts.intent)
    binds.push(opts?.limit ?? 50)
    const res = await this.db
      .prepare(`SELECT * FROM leads ${where} ORDER BY score_total DESC LIMIT ?`)
      .bind(...binds)
      .all<LeadRow>()
    return (res.results ?? []).map(rowToLead)
  }
}
