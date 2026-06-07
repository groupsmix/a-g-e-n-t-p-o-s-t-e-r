import { describe, it, expect } from 'vitest'
import { InMemoryGraphClient } from '../adapters/inmemory'
import { contextFor, ingestLead, ingestNote } from './ingest'

describe('memory graph ingest', () => {
  it('round-trips a note through recall', async () => {
    const c = new InMemoryGraphClient()
    await ingestNote(c, 'g1', 'User likes dry humour and short emails.')
    const ctx = await contextFor(c, 'g1', 'humour')
    expect(ctx).toContain('User likes dry humour')
  })

  it('ingests a lead with metadata', async () => {
    const c = new InMemoryGraphClient()
    await ingestLead(c, 'g1', {
      id: 'l1', handle: 'alice', platform: 'x',
      context: 'asked about agent setup', score: 80,
      sourceUrl: 'https://x.com/alice/status/1', status: 'prospect',
      createdAt: new Date('2026-01-01T00:00:00Z'),
    })
    const ctx = await contextFor(c, 'g1', 'agent setup')
    expect(ctx).toContain('Lead alice')
  })
})
