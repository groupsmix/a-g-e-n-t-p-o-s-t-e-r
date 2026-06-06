'use client'

import { useQuery } from '@tanstack/react-query'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { timeAgo } from '@/lib/utils'
import { BookOpenText, CheckCircle2, XCircle, AlertCircle, Slash } from 'lucide-react'
import type { JournalEntryDTO } from '@/lib/brain/types'

interface JournalResponse {
  source: string
  entries: JournalEntryDTO[]
}

const OUTCOME_ICON: Record<JournalEntryDTO['outcome'], JSX.Element> = {
  success: <CheckCircle2 className="h-4 w-4 text-success" />,
  failed: <XCircle className="h-4 w-4 text-destructive" />,
  partial: <AlertCircle className="h-4 w-4 text-warning" />,
  cancelled: <Slash className="h-4 w-4 text-muted-foreground" />,
}

export function JournalTimeline(): JSX.Element {
  const { data, isLoading } = useQuery<JournalResponse>({
    queryKey: ['brain', 'journal'],
    queryFn: async () => {
      const r = await fetch('/api/brain/journal?limit=20')
      if (!r.ok) throw new Error('journal fetch failed')
      return r.json()
    },
    refetchInterval: 60_000,
  })

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <BookOpenText className="h-4 w-4 text-muted-foreground" />
          <CardTitle>Journal</CardTitle>
        </div>
        <CardDescription>
          Every agent run writes here. Learnings drive future planning. Follow-ups become signals.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <JournalSkeleton />
        ) : (data?.entries ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No entries yet.</p>
        ) : (
          <ol className="relative space-y-4 border-l pl-5">
            {(data?.entries ?? []).map((j) => (
              <li key={j.id} className="relative">
                <span className="absolute -left-[27px] flex h-4 w-4 items-center justify-center rounded-full bg-background">
                  {OUTCOME_ICON[j.outcome]}
                </span>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{j.agentId ?? 'system'}</span>
                    <span>·</span>
                    <span>{timeAgo(j.createdAt)}</span>
                    {j.consolidated ? (
                      <Badge variant="outline" className="text-[9px] uppercase">
                        consolidated
                      </Badge>
                    ) : null}
                  </div>
                  <p className="text-sm leading-snug">{j.summary}</p>
                  {j.learnings.length > 0 ? (
                    <ul className="ml-2 list-disc space-y-0.5 text-[12px] text-muted-foreground">
                      {j.learnings.map((l, i) => (
                        <li key={i}>{l}</li>
                      ))}
                    </ul>
                  ) : null}
                  {j.followUps.length > 0 ? (
                    <div className="mt-1 rounded-sm bg-muted/40 px-2 py-1 text-[11px]">
                      <span className="font-medium uppercase text-muted-foreground">
                        Follow-ups:
                      </span>{' '}
                      {j.followUps.join(' · ')}
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  )
}

function JournalSkeleton(): JSX.Element {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-20 animate-pulse rounded-md bg-muted/30" />
      ))}
    </div>
  )
}
