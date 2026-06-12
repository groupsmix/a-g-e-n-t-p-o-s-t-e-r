import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('Route Hygiene', () => {
  it('ensures every route file in src/routes is imported in src/index.ts', () => {
    const routesDir = __dirname
    const indexFilePath = path.join(routesDir, '../index.ts')
    const indexContent = fs.readFileSync(indexFilePath, 'utf8')

    const files = fs.readdirSync(routesDir)
    const routeFiles = files.filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))

    for (const file of routeFiles) {
      const baseName = file.replace('.ts', '')
      const importPattern = new RegExp(`from\\s+['"]\\./routes/${baseName}['"]`)
      expect(indexContent).toSatisfy(
        (content: string) => importPattern.test(content),
        `Route file "${file}" is not imported in index.ts (expected import from './routes/${baseName}')`
      )
    }
  })

  it('ensures no duplicate route mount paths exist in src/index.ts', () => {
    const routesDir = __dirname
    const indexFilePath = path.join(routesDir, '../index.ts')
    const indexContent = fs.readFileSync(indexFilePath, 'utf8')

    const mountRegex = /api\.route\(\s*['"]\/([^'"]+)['"]\s*,\s*([^)]+)\)/g
    const mountedPrefixes = new Map<string, string>()
    let match
    while ((match = mountRegex.exec(indexContent)) !== null) {
      const prefix = match[1]
      const routerName = match[2].trim()

      if (mountedPrefixes.has(prefix)) {
        // Categories is a known reuse of domainRoutes
        if (prefix === 'categories' && routerName === 'domainRoutes') {
          continue
        }
        // Niches is a known reuse of scoringRoutes
        if (prefix === 'niches' && routerName === 'scoringRoutes') {
          continue
        }
        throw new Error(`Duplicate mount prefix found in index.ts: "/api/${prefix}"`)
      }
      mountedPrefixes.set(prefix, routerName)
    }
  })
})
