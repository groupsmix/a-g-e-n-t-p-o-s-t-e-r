import { ModuleStub } from '@/components/shared/ModuleStub'

export default function PublisherPage(): JSX.Element {
  return (
    <ModuleStub
      title="Publisher"
      description="Every social platform, one queue. Schedule, publish, retry, prove it shipped."
      status="beta"
      roadmap={[
        { task: 'TASK-600', label: 'Platform adapters (Twitter, Instagram, TikTok, YouTube, LinkedIn, Pinterest, Threads)', done: true },
        { task: 'TASK-601', label: 'Unified queue UI inside dashboard' },
        { task: 'TASK-602', label: 'Per-platform health + rate-limit panel' },
        { task: 'TASK-603', label: 'Failure replay + manual override' },
      ]}
    />
  )
}
