/**
 * Brain — TASK-203 Memory Dashboard UI.
 *
 * Single page that renders the entire brain layer:
 *   • Summary tiles (memory counts, journal volume, urgent signals, NOW expiry)
 *   • Proactivity signals (ranked by score, with suggested actions)
 *   • Memory explorer (filter by type, free-text search)
 *   • Journal timeline (latest agent runs, learnings, follow-ups)
 *   • Persona panel (SOUL.md + NOW scratchpad)
 *
 * All data flows through /api/brain/* routes which delegate to a
 * pluggable BrainSource (demo by default, nexus-api once TASK-300 lands).
 */

import { Badge } from '@/components/ui/badge'
import { BrainSummary } from './components/BrainSummary'
import { SignalsPanel } from './components/SignalsPanel'
import { MemoryExplorer } from './components/MemoryExplorer'
import { JournalTimeline } from './components/JournalTimeline'
import { PersonaPanel } from './components/PersonaPanel'

export const dynamic = 'force-dynamic'

export default function BrainPage(): JSX.Element {
  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Brain</h1>
          <Badge variant="success" className="text-[10px] uppercase">
            active
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Memory, persona, NOW, and proactivity in one view. This is what every agent reads
          before doing anything.
        </p>
      </header>

      <BrainSummary />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <SignalsPanel />
          <MemoryExplorer />
          <JournalTimeline />
        </div>
        <div className="space-y-6 lg:col-span-1">
          <PersonaPanel />
        </div>
      </div>
    </div>
  )
}
