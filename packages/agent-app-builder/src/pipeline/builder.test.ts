import { describe, it, expect } from 'vitest'
import { defaultChecker, buildAndCheck } from './builder.js'

describe('builder/check', () => {
  it('flags unbalanced braces as errors', async () => {
    const res = await defaultChecker().check([
      { path: 'a.ts', content: 'const x = { foo: 1' },
    ])
    expect(res.some((i) => i.severity === 'error' && /brace/.test(i.message))).toBe(true)
  })

  it('flags placeholders as warnings', async () => {
    const res = await defaultChecker().check([
      { path: 'a.tsx', content: 'const x = () => { /* PLACEHOLDER */ }' },
    ])
    expect(res.some((i) => i.severity === 'warning' && /placeholder/.test(i.message))).toBe(true)
  })

  it('flags imports not in package.json', async () => {
    const pkg = {
      path: 'package.json',
      content: JSON.stringify({ dependencies: { react: '^18' } }),
    }
    const file = { path: 'a.ts', content: "import x from 'lodash'\nconst y = 1\n" }
    const issues = await defaultChecker().check([pkg, file])
    expect(issues.some((i) => /lodash/.test(i.message))).toBe(true)
  })

  it('buildAndCheck returns ok=false on errors', async () => {
    const app = {
      spec: {
        name: 'x',
        pitch: '',
        template: 'next-app' as const,
        pages: [],
        features: [],
      },
      files: [{ path: 'a.ts', content: '{' }],
    }
    const res = await buildAndCheck(app)
    expect(res.ok).toBe(false)
  })
})
