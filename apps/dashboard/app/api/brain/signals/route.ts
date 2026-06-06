import { NextRequest, NextResponse } from 'next/server'
import { chooseBrainSource } from '@/lib/brain/source'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const source = chooseBrainSource()
  const { searchParams } = new URL(req.url)
  const signals = await source.listSignals({
    limit: numberParam(searchParams.get('limit'), 25),
  })
  return NextResponse.json({ source: source.name, signals })
}

function numberParam(raw: string | null, fallback: number): number {
  if (!raw) return fallback
  const n = parseInt(raw, 10)
  return Number.isFinite(n) && n > 0 ? Math.min(n, 200) : fallback
}
