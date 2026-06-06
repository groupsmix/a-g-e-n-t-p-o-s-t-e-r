/**
 * @posteragent/identity/persona
 *
 * Owner-defined behavioural overrides layered on top of SOUL.md.
 *
 *   • Global traits apply to every agent prompt.
 *   • Agent-scoped traits (`agent:<name>`) layer on top of global for
 *     that agent only.
 *   • Channel-scoped traits (`channel:tiktok`, etc.) apply to publisher
 *     workflows targeting that platform.
 *
 * Stored in persona_traits (see migration 024).  Concatenated into the
 * system prompt by assembleSystemPrompt() in soul.ts.
 */

import type { D1Database } from '@posteragent/memory'

export interface PersonaTrait {
  id: string
  scope: string
  trait: string
  weight: number
  enabled: boolean
  createdAt: Date
  updatedAt: Date
}

export interface SetTraitInput {
  scope: string
  trait: string
  weight?: number
  enabled?: boolean
}

interface TraitRow {
  id: string
  scope: string
  trait: string
  weight: number
  enabled: number
  created_at: string
  updated_at: string
}

function rowToTrait(row: TraitRow): PersonaTrait {
  return {
    id: row.id,
    scope: row.scope,
    trait: row.trait,
    weight: row.weight,
    enabled: row.enabled === 1,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }
}

export class PersonaStore {
  constructor(private db: D1Database) {}

  async add(input: SetTraitInput): Promise<PersonaTrait> {
    const id = crypto.randomUUID().replace(/-/g, '')
    const now = new Date()
    await this.db
      .prepare(
        `INSERT INTO persona_traits (id, scope, trait, weight, enabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        input.scope,
        input.trait.trim(),
        input.weight ?? 1.0,
        input.enabled === false ? 0 : 1,
        now.toISOString(),
        now.toISOString(),
      )
      .run()
    return {
      id,
      scope: input.scope,
      trait: input.trait.trim(),
      weight: input.weight ?? 1.0,
      enabled: input.enabled !== false,
      createdAt: now,
      updatedAt: now,
    }
  }

  async list(scope?: string): Promise<PersonaTrait[]> {
    const sql = scope
      ? `SELECT id, scope, trait, weight, enabled, created_at, updated_at
         FROM persona_traits WHERE scope = ? AND enabled = 1
         ORDER BY weight DESC, created_at ASC`
      : `SELECT id, scope, trait, weight, enabled, created_at, updated_at
         FROM persona_traits WHERE enabled = 1
         ORDER BY weight DESC, created_at ASC`
    const stmt = scope ? this.db.prepare(sql).bind(scope) : this.db.prepare(sql)
    const result = await stmt.all<TraitRow>()
    return (result.results ?? []).map(rowToTrait)
  }

  async toggle(id: string, enabled: boolean): Promise<void> {
    await this.db
      .prepare('UPDATE persona_traits SET enabled = ?, updated_at = ? WHERE id = ?')
      .bind(enabled ? 1 : 0, new Date().toISOString(), id)
      .run()
  }

  async remove(id: string): Promise<void> {
    await this.db.prepare('DELETE FROM persona_traits WHERE id = ?').bind(id).run()
  }

  /**
   * Resolve the effective traits for a given agent + (optional) channel.
   * Returns just the trait text, ordered for prompt insertion:
   *   global → agent:<name> → channel:<name>
   * Truncated to `maxTraits` to keep the system prompt under control.
   */
  async resolve(opts: {
    agent?: string
    channel?: string
    maxTraits?: number
  } = {}): Promise<string[]> {
    const scopes = ['global']
    if (opts.agent) scopes.push(`agent:${opts.agent}`)
    if (opts.channel) scopes.push(`channel:${opts.channel}`)

    const placeholders = scopes.map(() => '?').join(',')
    const result = await this.db
      .prepare(
        `SELECT id, scope, trait, weight, enabled, created_at, updated_at
         FROM persona_traits
         WHERE enabled = 1 AND scope IN (${placeholders})
         ORDER BY
           CASE scope
             WHEN 'global' THEN 0
             WHEN ? THEN 1
             ELSE 2
           END,
           weight DESC,
           created_at ASC`,
      )
      .bind(...scopes, opts.agent ? `agent:${opts.agent}` : '__none__')
      .all<TraitRow>()

    const traits = (result.results ?? []).map((r) => r.trait)
    return opts.maxTraits ? traits.slice(0, opts.maxTraits) : traits
  }
}
