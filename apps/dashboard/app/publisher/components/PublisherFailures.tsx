'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AlertCircle, RotateCcw } from 'lucide-react'
import { api } from '@/lib/api'

export function PublisherFailures(): JSX.Element {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['publisher', 'jobs', 'failed'],
    queryFn: () => api.publisher.jobs({ status: 'failed', limit: 20 }),
    refetchInterval: 30_000,
  })

  const retry = useMutation({
    mutationFn: (id: string) => api.publisher.retry(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['publisher'] }),
  })

  const failures = data?.jobs ?? []

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-rose-500" />
          Failures
        </CardTitle>
        <CardDescription>Most recent platform errors. One click to retry.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded bg-muted/30" />
            ))}
          </div>
        ) : failures.length === 0 ? (
          <p className="text-sm text-muted-foreground">No failures. Everything is shipping.</p>
        ) : (
          failures.map((j) => (
            <div
              key={j.idempotency_key}
              className="rounded-md border border-rose-500/30 bg-rose-500/5 p-3 text-xs"
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="uppercase text-rose-500 font-medium">{j.platform}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2"
                  disabled={retry.isPending}
                  onClick={() => retry.mutate(j.idempotency_key)}
                >
                  <RotateCcw className="mr-1 h-3 w-3" /> retry
                </Button>
              </div>
              <div className="font-medium truncate">{j.title}</div>
              {j.error && (
                <p className="mt-1 text-muted-foreground line-clamp-2">{j.error}</p>
              )}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}
