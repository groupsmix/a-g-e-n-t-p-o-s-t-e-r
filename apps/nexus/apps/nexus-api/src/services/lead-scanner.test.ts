import { describe, it, expect } from 'vitest'
import { scoreText } from './lead-scanner'

describe('scoreText (lead intent scoring)', () => {
  it('flags buying intent above all other intents', () => {
    const r = scoreText(
      'Looking to buy a tool that does X. Budget is $200. Any recommendations?',
      ['tool'],
    )
    expect(r.intent).toBe('buying')
    expect(r.total).toBeGreaterThan(40)
    expect(r.components.buying).toBeGreaterThan(0)
  })

  it('flags comparing intent on "vs"', () => {
    const r = scoreText('Has anyone tried tool-a vs tool-b for this?', ['tool-a'])
    expect(r.intent).toBe('comparing')
  })

  it('flags asking intent on a how-do-i question', () => {
    const r = scoreText('How do I get started with widgets? Need help with setup.', ['widgets'])
    expect(r.intent).toBe('asking')
  })

  it('flags frustration on negative-experience language', () => {
    const r = scoreText('I hate that widgets keep breaking, doesn\'t work for me.', ['widgets'])
    expect(r.intent).toBe('frustrated')
  })

  it('downscores meme/joke posts via negative patterns', () => {
    const plain = scoreText('Looking to buy widgets, any recommendations?', ['widgets'])
    const memed = scoreText('Looking to buy widgets, any recommendations? lol jk', ['widgets'])
    expect(memed.total).toBeLessThan(plain.total)
    expect(memed.components.penalty).toBeLessThan(0)
  })

  it('rewards more term matches', () => {
    const one = scoreText('Need help with widgets here, broken setup.', ['widgets'])
    const three = scoreText(
      'Need help with widgets, gadgets, and sprockets — all broken.',
      ['widgets', 'gadgets', 'sprockets'],
    )
    expect(three.components.terms).toBeGreaterThan(one.components.terms ?? 0)
  })

  it('penalises very short posts', () => {
    const r = scoreText('lol', ['x'])
    expect(r.components.too_short).toBeLessThan(0)
  })

  it('never returns a negative total', () => {
    const r = scoreText('', [])
    expect(r.total).toBeGreaterThanOrEqual(0)
  })

  it('returns "other" when no intent signal matches', () => {
    const r = scoreText('A neutral statement about widgets.', ['widgets'])
    expect(r.intent).toBe('other')
  })
})
