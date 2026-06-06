'use client'

import { useQuery } from '@tanstack/react-query'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { timeAgo } from '@/lib/utils'
import { Sparkles, Target } from 'lucide-react'
import type { NowEntryDTO, PersonaDTO } from '@/lib/brain/types'

interface PersonaResponse { source: string; persona: PersonaDTO }
interface NowResponse { source: string; now: NowEntryDTO | null }

export function PersonaPanel(): JSX.Element {
  const persona = useQuery<PersonaResponse>({
    queryKey: ['brain', 'persona'],
    queryFn: async () => {
      const r = await fetch('/api/brain/persona')
      if (!r.ok) throw new Error('persona fetch failed')
      return r.json()
    },
  })

  const now = useQuery<NowResponse>({
    queryKey: ['brain', 'now'],
    queryFn: async () => {
      const r = await fetch('/api/brain/now')
      if (!r.ok) throw new Error('now fetch failed')
      return r.json()
    },
    refetchInterval: 60_000,
  })

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-muted-foreground" />
            <CardTitle>NOW scratchpad</CardTitle>
          </div>
          <CardDescription>
            The current-focus line every agent prompt is anchored to.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {now.isLoading ? (
            <div className="h-16 animate-pulse rounded bg-muted/30" />
          ) : !now.data?.now ? (
            <p className="text-sm text-muted-foreground">
              No NOW set. Agents will fall back to recent tasks.
            </p>
          ) : (
            <div className="space-y-2">
              <p className="text-sm leading-snug">{now.data.now.content}</p>
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <Badge variant="outline" className="text-[10px] uppercase">
                  scope: {now.data.now.scope}
                </Badge>
                <span>
                  expires{' '}
                  {now.data.now.expiresInMs <= 0
                    ? 'now'
                    : `in ~${Math.round(now.data.now.expiresInMs / 3_600_000)}h`}
                </span>
                <span>· set {timeAgo(now.data.now.updatedAt)}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-muted-foreground" />
            <CardTitle>Persona</CardTitle>
          </div>
          <CardDescription>SOUL.md — the voice every agent inherits.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {persona.isLoading ? (
            <div className="h-32 animate-pulse rounded bg-muted/30" />
          ) : !persona.data ? (
            <p className="text-sm text-muted-foreground">No persona loaded.</p>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-2xl">
                  {persona.data.persona.emoji}
                </div>
                <div>
                  <div className="text-base font-semibold">{persona.data.persona.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {persona.data.persona.tagline}
                  </div>
                </div>
              </div>
              <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-[12px] leading-snug">
                {persona.data.persona.soul}
              </pre>
              <div className="text-[11px] text-muted-foreground">
                updated {timeAgo(persona.data.persona.updatedAt)}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
