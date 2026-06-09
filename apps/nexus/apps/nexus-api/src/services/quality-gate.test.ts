import { describe, it, expect } from 'vitest'
import { detectSlop } from './quality-gate'

describe('detectSlop — reject filter (T4)', () => {
  it('passes a clean product', () => {
    expect(
      detectSlop({
        name: 'Notion CRM Template for Freelance Designers',
        description: 'A ready-to-use client tracker with pipelines, invoices, and follow-up reminders.',
      }),
    ).toEqual([])
  })

  it('flags an Untitled / placeholder title', () => {
    expect(detectSlop({ name: 'Untitled', description: 'x'.repeat(40) })[0]).toMatch(/placeholder/i)
    expect(detectSlop({ name: 'New Product' }).length).toBeGreaterThan(0)
    expect(detectSlop({ name: 'untitled product' }).length).toBeGreaterThan(0)
  })

  it('flags bracketed placeholders', () => {
    expect(detectSlop({ name: 'Guide for [INSERT NICHE]' }).length).toBeGreaterThan(0)
    expect(detectSlop({ name: 'The Ultimate [TOPIC] Planner' }).length).toBeGreaterThan(0)
    expect(detectSlop({ name: 'Career with [Action] Plans' }).length).toBeGreaterThan(0)
    expect(detectSlop({ name: 'The [Digital] Marketing Guide' }).length).toBeGreaterThan(0)
    expect(detectSlop({ name: '[Topic] for Beginners' }).length).toBeGreaterThan(0)
    expect(detectSlop({ name: 'Quick [X] Planner' }).length).toBeGreaterThan(0)
    expect(detectSlop({ description: 'Built for {{audience}} who want results.' }).length).toBeGreaterThan(0)
    expect(detectSlop({ description: 'Perfect for {topic} lovers.' }).length).toBeGreaterThan(0)
    expect(detectSlop({ name: 'A <product> for everyone' }).length).toBeGreaterThan(0)
  })

  it('flags draft markers', () => {
    expect(detectSlop({ description: 'TODO: write the real description here' }).length).toBeGreaterThan(0)
    expect(detectSlop({ description: 'Lorem ipsum dolor sit amet.' }).length).toBeGreaterThan(0)
  })

  it('flags doubled words', () => {
    expect(detectSlop({ name: 'The The Productivity Planner' })[0]).toMatch(/doubled/i)
    expect(detectSlop({ description: 'This is the the best planner ever.' }).length).toBeGreaterThan(0)
  })

  it('does NOT flag legitimate brackets/parentheses or non-repeating words', () => {
    expect(detectSlop({ name: 'Year in Review (2024 Edition)' })).toEqual([])
    expect(detectSlop({ name: 'New York Travel Guide' })).toEqual([])
    expect(
      detectSlop({
        name: 'Budget Tracker',
        description: 'Track income and expenses across multiple accounts with monthly rollups.',
      }),
    ).toEqual([])
  })

  it('handles null/empty input', () => {
    expect(detectSlop({})).toEqual([])
    expect(detectSlop({ name: null, description: null })).toEqual([])
  })
})
