import { NextResponse } from 'next/server'
import { chooseBrainSource } from '@/lib/brain/source'

export const dynamic = 'force-dynamic'

export async function GET() {
  const source = chooseBrainSource()
  const summary = await source.getSummary()
  return NextResponse.json({ source: source.name, summary })
}
