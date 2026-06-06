import { NextRequest, NextResponse } from 'next/server'
import { chooseBrainSource } from '@/lib/brain/source'
import type { MemoryItemDTO } from '@/lib/brain/types'

export const dynamic = 'force-dynamic'

const TYPES: ReadonlyArray<MemoryItemDTO['type']> = [
  'fact',
  'event',
  'preference',
  'project',
  'identity',
]

export async function GET(req: NextRequest) {
  const source = chooseBrainSource()
  const { searchParams } = new URL(req.url)
  const typeParam = searchParams.get('type') as MemoryItemDTO['type'] | null
  const memories = await source.listMemories({
    type: typeParam && TYPES.includes(typeParam) ? typeParam : undefined,
    query: searchParams.get('q') ?? undefined,
    limit: numberParam(searchParams.get('limit'), 50),
  })
  return NextResponse.json({ source: source.name, memories })
}

function numberParam(raw: string | null, fallback: number): number {
  if (!raw) return fallback
  const n = parseInt(raw, 10)
  return Number.isFinite(n) && n > 0 ? Math.min(n, 200) : fallback
}
