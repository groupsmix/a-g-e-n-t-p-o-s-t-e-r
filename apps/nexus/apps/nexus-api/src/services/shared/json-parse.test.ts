import { describe, it, expect } from 'vitest'
import { safeJson } from './json-parse'

describe('safeJson', () => {
  it('parses clean JSON', () => {
    expect(safeJson('{"key":"value"}')).toEqual({ key: 'value' })
  })

  it('strips ```json fences', () => {
    const input = '```json\n{"tool":"browse","args":{}}\n```'
    expect(safeJson(input)).toEqual({ tool: 'browse', args: {} })
  })

  it('extracts first balanced {} from prose', () => {
    const input = 'Here is the result:\n{"reply":"done"}\nHope that helps!'
    expect(safeJson(input)).toEqual({ reply: 'done' })
  })

  it('returns null for empty string', () => {
    expect(safeJson('')).toBeNull()
  })

  it('returns null for garbage', () => {
    expect(safeJson('not json at all')).toBeNull()
  })

  it('passes through non-string values', () => {
    expect(safeJson({ already: 'parsed' })).toEqual({ already: 'parsed' })
    expect(safeJson(null)).toBeNull()
  })
})
