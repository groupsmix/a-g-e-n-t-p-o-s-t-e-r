import { ModuleStub } from '@/components/shared/ModuleStub'

export default function AutonomePage(): JSX.Element {
  return (
    <ModuleStub
      title="Autonome"
      description="Scheduled agents and goal tracker. Set it once, it runs forever, it tells you when something needs you."
      status="beta"
      roadmap={[
        { task: 'TASK-800', label: 'Cron + workflow scheduler (nexus-api already has schedules route)', done: true },
        { task: 'TASK-801', label: 'Goal tracker (north-star metric → daily action plan)' },
        { task: 'TASK-802', label: 'Autopilot quality gates (no-publish without human approval threshold)' },
        { task: 'TASK-803', label: 'Daily digest email with what ran + what needs you' },
      ]}
    />
  )
}
