import { describe, it, expect } from 'vitest'
import { AI_REGISTRY } from './registry'

describe('AI Registry', () => {
  it('has no search providers in AI_REGISTRY', () => {
    const searchProviders = ['tavily', 'exa', 'serpapi', 'dataforseo']
    
    for (const [, models] of Object.entries(AI_REGISTRY)) {
      for (const model of models!) {
        expect(searchProviders).not.toContain(model.provider)
      }
    }
  })

  it('all models have supportsJsonMode explicitly set', () => {
    for (const [, models] of Object.entries(AI_REGISTRY)) {
      for (const model of models!) {
        expect(typeof model.supportsJsonMode).toBe('boolean')
      }
    }
  })

  it('all models have cost fields configured', () => {
    for (const [, models] of Object.entries(AI_REGISTRY)) {
      for (const model of models!) {
        expect(typeof model.costPer1kIn).toBe('number')
        expect(typeof model.costPer1kOut).toBe('number')
      }
    }
  })

  it('all models have maxOutputTokens configured', () => {
    for (const [, models] of Object.entries(AI_REGISTRY)) {
      for (const model of models!) {
        expect(typeof model.maxOutputTokens).toBe('number')
      }
    }
  })
})
