import { NextRequest, NextResponse } from 'next/server'
import { chooseBrainSource } from '@/lib/brain/source'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const source = chooseBrainSource()
  const { searchParams } = new URL(req.url)
  const now = await source.getNow(searchParams.get('scope') ?? 'global')
  return NextResponse.json({ source: source.name, now })
}
