import { ModuleStub } from '@/components/shared/ModuleStub'

export default function RevenuePage(): JSX.Element {
  return (
    <ModuleStub
      title="Revenue"
      description="Affiliate, Gumroad, Amazon, and KPI roll-up. Every dollar in, attributed to the content that made it."
      status="planned"
      roadmap={[
        { task: 'TASK-900', label: 'Gumroad webhook ingest → revenue events table' },
        { task: 'TASK-901', label: 'Amazon Associates report parser + daily roll-up' },
        { task: 'TASK-902', label: 'Affiliate link rewriter + click tracker' },
        { task: 'TASK-903', label: 'Revenue attribution view (which post earned what)' },
      ]}
    />
  )
}
