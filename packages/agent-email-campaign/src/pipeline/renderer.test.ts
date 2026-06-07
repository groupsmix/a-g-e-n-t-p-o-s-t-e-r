import { describe, it, expect } from 'vitest'
import { mustache, renderEmail } from './renderer'
import { sendBatch } from './sender'
import { InMemoryCampaignStore } from './storage'
import { planSchedule, pruneRepliedSteps } from './scheduler'
import type { Campaign, EmailProvider, Recipient, SendReceipt } from '../types'

const CAMPAIGN: Campaign = {
  id: 'c1',
  kind: 'cold-sequence',
  name: 'demo',
  from: { email: 'me@x.dev', name: 'Pax' },
  steps: [
    {
      id: 's1',
      delay_hours: 0,
      template: { id: 't1', subject: 'Hi {{name}}', body: 'Hey {{name}} — saw {{company}}.' },
    },
    {
      id: 's2',
      delay_hours: 48,
      template: { id: 't2', subject: 'Following up', body: 'Quick bump.' },
      stop_on_reply: true,
    },
    {
      id: 's3',
      delay_hours: 96,
      template: { id: 't3', subject: 'Last note', body: 'No worries.' },
    },
  ],
}

const RECIPIENT: Recipient = {
  email: 'alice.morgan@acme.com',
  vars: { company: 'Acme' },
}

describe('mustache', () => {
  it('falls back to derived name from email local-part', () => {
    expect(mustache('Hi {{name}}', RECIPIENT)).toBe('Hi Alice Morgan')
  })
  it('substitutes vars', () => {
    expect(mustache('co={{company}}', RECIPIENT)).toBe('co=Acme')
  })
  it('blanks unknown vars rather than crashing', () => {
    expect(mustache('{{unknown}}!', RECIPIENT)).toBe('!')
  })
})

describe('renderEmail', () => {
  it('produces a tracking_id and embeds a pixel', async () => {
    const r = await renderEmail({
      campaign: CAMPAIGN,
      step: CAMPAIGN.steps[0]!,
      recipient: RECIPIENT,
      trackingBaseUrl: 'https://track.example',
    })
    expect(r.tracking_id).toMatch(/^[0-9a-f]{8}$/)
    expect(r.html).toContain('track.example/o/')
    expect(r.subject).toBe('Hi Alice Morgan')
  })

  it('rewrites CLICK helpers into tracked redirects', async () => {
    const customCampaign: Campaign = {
      ...CAMPAIGN,
      steps: [
        {
          ...CAMPAIGN.steps[0]!,
          template: {
            ...CAMPAIGN.steps[0]!.template,
            html: '<a href="{{CLICK url=\'https://x.dev\'}}">link</a>',
          },
        },
      ],
    }
    const r = await renderEmail({
      campaign: customCampaign,
      step: customCampaign.steps[0]!,
      recipient: RECIPIENT,
      trackingBaseUrl: 'https://track.example',
    })
    expect(r.html).toContain('track.example/c/')
    expect(r.html).toContain('u=https%3A%2F%2Fx.dev')
  })
})

describe('sendBatch', () => {
  function stubProvider(succeed: boolean): EmailProvider {
    return {
      name: 'resend',
      send: async () =>
        ({
          provider: 'resend',
          provider_id: succeed ? 'rs-1' : null,
          ok: succeed,
          error: succeed ? undefined : 'boom',
        }) as SendReceipt,
    }
  }

  it('records sent events on success', async () => {
    const store = new InMemoryCampaignStore()
    const email = await renderEmail({
      campaign: CAMPAIGN,
      step: CAMPAIGN.steps[0]!,
      recipient: RECIPIENT,
      trackingBaseUrl: 'https://t',
    })
    const r = await sendBatch({
      campaign: CAMPAIGN,
      emails: [email],
      provider: stubProvider(true),
      store,
    })
    expect(r.sent).toBe(1)
    const agg = await store.aggregate(CAMPAIGN.id)
    expect(agg.sent).toBe(1)
  })

  it('records bounce when provider fails', async () => {
    const store = new InMemoryCampaignStore()
    const email = await renderEmail({
      campaign: CAMPAIGN,
      step: CAMPAIGN.steps[0]!,
      recipient: RECIPIENT,
      trackingBaseUrl: 'https://t',
    })
    const r = await sendBatch({
      campaign: CAMPAIGN,
      emails: [email],
      provider: stubProvider(false),
      store,
    })
    expect(r.failed).toBe(1)
    const agg = await store.aggregate(CAMPAIGN.id)
    expect(agg.bounce).toBe(1)
  })

  it('respects daily cap', async () => {
    const store = new InMemoryCampaignStore()
    const capped: Campaign = { ...CAMPAIGN, daily_cap: 1 }
    const emails = await Promise.all(
      [RECIPIENT, { email: 'b@x.dev' }, { email: 'c@x.dev' }].map((r) =>
        renderEmail({
          campaign: capped,
          step: capped.steps[0]!,
          recipient: r,
          trackingBaseUrl: 'https://t',
        }),
      ),
    )
    const r = await sendBatch({
      campaign: capped,
      emails,
      provider: stubProvider(true),
      store,
    })
    expect(r.sent).toBe(1)
    expect(r.skipped_cap).toBe(2)
  })

  it('skips entire batch outside send_window_utc', async () => {
    const store = new InMemoryCampaignStore()
    const windowed: Campaign = { ...CAMPAIGN, send_window_utc: [9, 17] }
    const email = await renderEmail({
      campaign: windowed,
      step: windowed.steps[0]!,
      recipient: RECIPIENT,
      trackingBaseUrl: 'https://t',
    })
    const r = await sendBatch({
      campaign: windowed,
      emails: [email],
      provider: stubProvider(true),
      store,
      now: () => new Date('2026-06-07T03:00:00Z'),
    })
    expect(r.skipped_window).toBe(1)
    expect(r.sent).toBe(0)
  })
})

describe('scheduler', () => {
  it('plans cumulative due_at per step', () => {
    const plan = planSchedule(CAMPAIGN, RECIPIENT, new Date('2026-06-01T00:00:00Z'))
    expect(plan).toHaveLength(3)
    expect(plan[0]!.due_at).toBe('2026-06-01T00:00:00.000Z')
    expect(plan[1]!.due_at).toBe('2026-06-03T00:00:00.000Z')
    expect(plan[2]!.due_at).toBe('2026-06-05T00:00:00.000Z')
  })

  it('prunes steps after a recorded reply when stop_on_reply', async () => {
    const store = new InMemoryCampaignStore()
    const plan = planSchedule(CAMPAIGN, RECIPIENT, new Date('2026-06-01T00:00:00Z'))
    // Record a reply on step 1's tracking_id
    await store.recordEvent({
      tracking_id: plan[0]!.tracking_id_preview,
      kind: 'reply',
      at: '2026-06-01T00:00:00Z',
    })
    const survivors = await pruneRepliedSteps(plan, store)
    // step 0 stays (where the reply happened), step 1 is stop_on_reply (dropped),
    // step 2 has no stop_on_reply so it stays.
    expect(survivors.map((s) => s.step.id)).toEqual(['s1', 's3'])
  })
})
