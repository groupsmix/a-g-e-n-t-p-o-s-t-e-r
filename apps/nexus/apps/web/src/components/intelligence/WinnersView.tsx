'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import type { WinnerPattern } from '@nexus/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'

export function WinnersView() {
  const [patterns, setPatterns] = useState<WinnerPattern[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getWinnerPatterns()
      .then((data) => setPatterns(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (patterns.length === 0) {
    return (
      <Card className="p-16 text-center">
        <p className="text-muted-foreground">No patterns detected yet</p>
        <p className="text-sm text-muted-foreground mt-2">
          Patterns are learned from approved products — and from real Gumroad sales once your token is connected.
        </p>
      </Card>
    )
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {patterns.map((pattern) => (
        <Card key={pattern.id}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{pattern.pattern_type || 'Unknown'}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">
              {pattern.pattern_value}
            </p>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                Detected in {pattern.sample_count || 0} products
              </span>
              <span className="px-2 py-1 bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300 text-xs rounded-full">
                {Math.round((pattern.confidence || 0) * 100)}% confidence
              </span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
