import { describe, it, expect } from 'vitest'
import { segmentScript } from './segmenter.js'
import { runPodcast } from './podcast.js'

describe('segmentScript', () => {
  it('splits by [Voice]: tag', () => {
    const s = segmentScript('[Host]: Hi.\n[Guest]: Thanks.\n[Host]: Cool.')
    expect(s).toHaveLength(3)
    expect(s[0]!.voice).toBe('host')
    expect(s[1]!.voice).toBe('guest')
  })

  it('treats untagged text as host', () => {
    const s = segmentScript('Welcome to the show.')
    expect(s).toHaveLength(1)
    expect(s[0]!.voice).toBe('host')
  })

  it('merges consecutive same-voice lines', () => {
    const s = segmentScript('[Host]: a\n[Host]: b\n[Guest]: c')
    expect(s).toHaveLength(2)
    expect(s[0]!.text).toContain('a')
    expect(s[0]!.text).toContain('b')
  })
})

describe('runPodcast (no TTS)', () => {
  it('produces a placeholder episode end-to-end', async () => {
    const r = await runPodcast({
      show: 'Test Show',
      title: 'Ep 1',
      script: '[Host]: hello world\n[Guest]: hi',
    })
    expect(r.episode.segments).toHaveLength(2)
    expect(r.episode.totalDurationSec).toBeGreaterThan(0)
    expect(r.episode.chapters.length).toBeGreaterThan(0)
  })

  it('uploads + RSS chain works with stubs', async () => {
    const r = await runPodcast(
      { show: 'S', title: 'T', script: 'hello' },
      {
        uploader: { async upload({ title }) { return { ok: true, provider: 'stub', url: `https://x/${title}` } } },
        rss: { async append() { return { ok: true, guid: 'g1' } } },
      },
    )
    expect(r.upload?.ok).toBe(true)
    expect(r.feed?.ok).toBe(true)
  })

  it('upload failure stops RSS append', async () => {
    const r = await runPodcast(
      { show: 'S', title: 'T', script: 'hello' },
      {
        uploader: { async upload() { return { ok: false, provider: 'stub', error: 'nope' } } },
        rss: { async append() { return { ok: true } } },
      },
    )
    expect(r.upload?.ok).toBe(false)
    expect(r.feed).toBeUndefined()
  })
})
