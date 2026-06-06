import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { MetricCard } from '@/components/shared/MetricCard'
import { AgentStatus } from '@/components/shared/AgentStatus'
import { Activity, Sparkles } from 'lucide-react'

export default function Home(): JSX.Element {
  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Mission Control</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every agent, every task, every dollar — one window.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground">
          <Sparkles className="h-3 w-3" />
          Press <kbd className="rounded border bg-background px-1 py-0.5 font-mono">⌘K</kbd> to run anything
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <MetricCard label="Tasks today" value="0" delta="+0" icon="tasks" />
        <MetricCard
          label="AI spend"
          value="$0.00"
          delta="of $20 budget"
          intent="default"
          icon="spend"
        />
        <MetricCard label="Active agents" value="0" icon="agents" />
        <MetricCard label="Revenue 24h" value="$0.00" intent="success" icon="revenue" />
        <MetricCard label="New leads" value="0" icon="leads" />
      </div>

      {/* Activity feed */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              <CardTitle>Live activity</CardTitle>
            </div>
            <span className="text-xs text-muted-foreground">SSE stream — coming TASK-101</span>
          </CardHeader>
          <CardContent>
            <div className="flex h-64 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
              No tasks yet. Run something from <kbd className="mx-1 rounded border bg-muted px-1 py-0.5 font-mono">⌘K</kbd>.
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Agents</CardTitle>
            <CardDescription>Online status across the spine</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <AgentStatus
              name="Trend Agent"
              state="offline"
              description="Scans niches & spots winners"
            />
            <AgentStatus
              name="Poster Agent"
              state="offline"
              description="Publishes across socials"
            />
            <AgentStatus
              name="Site Content Agent"
              state="offline"
              description="Generates sites via CosmicJS"
            />
            <AgentStatus
              name="Queue Agent"
              state="offline"
              description="Decides next-best post"
            />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
