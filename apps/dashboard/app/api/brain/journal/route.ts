import { NextRequest, NextResponse } from 'next/server'
import { chooseBrainSource } from '@/lib/brain/source'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const source = chooseBrainSource()
  const { searchParams } = new URL(req.url)
  const entries = await source.listJournal({
    sinceISO: searchParams.get('since') ?? undefined,
    limit: numberParam(searchParams.get('limit'), 50),
  })
  return NextResponse.json({ source: source.name, entries })
}

function numberParam(raw: string | null, fallback: number): number {
  if (!raw) return fallback
  const n = parseInt(raw, 10)
  return Number.isFinite(n) && n > 0 ? Math.min(n, 200) : fallback
}
