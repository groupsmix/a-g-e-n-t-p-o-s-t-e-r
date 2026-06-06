import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2 } from 'lucide-react'

interface ModuleStubProps {
  title: string
  description: string
  status: 'active' | 'beta' | 'planned'
  /** Upcoming work to ship inside this module. */
  roadmap: { task: string; label: string; done?: boolean }[]
}

const STATUS_VARIANT = {
  active: 'success',
  beta: 'warning',
  planned: 'secondary',
} as const

export function ModuleStub({ title, description, status, roadmap }: ModuleStubProps): JSX.Element {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <Badge variant={STATUS_VARIANT[status]} className="text-[10px] uppercase">
          {status}
        </Badge>
      </div>
      <p className="-mt-4 text-sm text-muted-foreground">{description}</p>

      <Card>
        <CardHeader>
          <CardTitle>Roadmap</CardTitle>
          <CardDescription>What lands inside this module, in order.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2.5">
            {roadmap.map((r) => (
              <li key={r.task} className="flex items-start gap-3 text-sm">
                {r.done ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                ) : (
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-muted-foreground/40" />
                )}
                <span className="font-mono text-xs text-muted-foreground">{r.task}</span>
                <span className="flex-1">{r.label}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
