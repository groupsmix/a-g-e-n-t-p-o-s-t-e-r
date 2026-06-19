import { Hono } from 'hono'
import type { Env } from '../env'
import {
  syncGumroadSales,
  extractPatterns,
  applyPatterns,
  getLearningStats,
  getLearningContext,
} from '../services/learning'
import type { LearningPattern } from '../services/learning'
import { createLogger } from '@posteragent/logger/workers'

const logger = createLogger({ service: 'nexus-api', module: 'learning' })

export const learningRoutes = new Hono<{ Bindings: Env }>()

// GET /learning/patterns — list winner patterns with stats
  .get('/patterns', async (c) => {
  try {
    const limit = parseInt(c.req.query('limit') || '50')
    const offset = parseInt(c.req.query('offset') || '0')

    const result = await c.env.DB
      .prepare(
        `SELECT * FROM winner_patterns
         ORDER BY total_revenue DESC, confidence_score DESC, confidence DESC
         LIMIT ? OFFSET ?`
      )
      .bind(limit, offset)
      .all<LearningPattern>()

    const countRow = await c.env.DB
      .prepare('SELECT COUNT(*) AS cnt FROM winner_patterns')
      .first<{ cnt: number }>()
      .catch((err) => {
        logger.error('COUNT query failed', err instanceof Error ? err : new Error(String(err)), {
          query: 'COUNT(*) FROM winner_patterns',
          table: 'winner_patterns',
        })
        return { cnt: 0 }
      })

    return c.json({
      patterns: result.results ?? [],
      total: countRow?.cnt ?? 0,
    })
  } catch (err) {
    logger.error('Error listing patterns', err instanceof Error ? err : new Error(String(err)))
    return c.json({ error: 'Failed to list patterns' }, 500)
  }
})


// POST /learning/analyze — trigger pattern extraction from sales data
  .post('/analyze', async (c) => {
  try {
    const result = await extractPatterns(c.env)
    return c.json({
      ok: true,
      ...result,
    })
  } catch (err) {
    logger.error('Analysis error', err instanceof Error ? err : new Error(String(err)))
    return c.json({ error: 'Pattern analysis failed' }, 500)
  }
})


// GET /learning/stats — overall learning loop stats
  .get('/stats', async (c) => {
  try {
    const stats = await getLearningStats(c.env)
    return c.json(stats)
  } catch (err) {
    logger.error('Stats error', err instanceof Error ? err : new Error(String(err)))
    return c.json({ error: 'Failed to fetch learning stats' }, 500)
  }
})


// POST /learning/sync — manually trigger Gumroad sales sync
  .post('/sync', async (c) => {
  try {
    const result = await syncGumroadSales(c.env)
    return c.json({ ok: !result.error, ...result })
  } catch (err) {
    logger.error('Sync error', err instanceof Error ? err : new Error(String(err)))
    return c.json({ error: 'Sales sync failed' }, 500)
  }
})


// GET /learning/weights — get current generation weights from patterns
  .get('/weights', async (c) => {
  try {
    const weights = await applyPatterns(c.env)
    return c.json(weights)
  } catch (err) {
    logger.error('Weights error', err instanceof Error ? err : new Error(String(err)))
    return c.json({ error: 'Failed to compute weights' }, 500)
  }
})


// GET /learning/context — the exact learning signal agents consume
// (winner patterns + operator approval outcomes + the prompt injection).
// Powers the Brain → Learning log tab so the loop is visible.
  .get('/context', async (c) => {
  try {
    const ctx = await getLearningContext(c.env)
    return c.json(ctx)
  } catch (err) {
    logger.error('Context error', err instanceof Error ? err : new Error(String(err)))
    return c.json({ error: 'Failed to compute learning context' }, 500)
  }
})


// Exported cron function: runs daily to sync sales + extract patterns
export async function runLearningSync(env: Env): Promise<void> {
  try {
    logger.info('Learning sync starting')
    const syncResult = await syncGumroadSales(env)
    logger.info('Learning sync complete', { synced: syncResult.synced })

    if (syncResult.synced > 0 || !syncResult.error) {
      const analysis = await extractPatterns(env)
      logger.info('Learning analysis complete', { patterns_created: analysis.patterns_created, patterns_updated: analysis.patterns_updated })
    }
  } catch (err) {
    logger.error('Learning sync cron error', err instanceof Error ? err : new Error(String(err)))
  }
}
