import { ModuleStub } from '@/components/shared/ModuleStub'

export default function BuilderPage(): JSX.Element {
  return (
    <ModuleStub
      title="Builder"
      description="App builder, site factory, and product generator. From idea to deployed artifact without a human in the IDE."
      status="planned"
      roadmap={[
        { task: 'TASK-400', label: 'Site factory CLI → CosmicJS (already scaffolded in apps/factory)', done: true },
        { task: 'TASK-401', label: 'One-click app builder (template registry → Cloudflare Pages deploy)' },
        { task: 'TASK-402', label: 'Product generator (ebook + landing + Gumroad listing in one run)' },
        { task: 'TASK-403', label: 'Component library browser inside the dashboard' },
      ]}
    />
  )
}
