import { ModuleStub } from '@/components/shared/ModuleStub'

export default function AnalysePage(): JSX.Element {
  return (
    <ModuleStub
      title="Analyse"
      description="Brand monitor, stock, trends, finance. The lens you'd ask an analyst to point at anything."
      status="planned"
      roadmap={[
        { task: 'TASK-700', label: 'Brand mention monitor (X / Reddit / HN / Google News)' },
        { task: 'TASK-701', label: 'Stock + crypto watchlist with daily signal summary' },
        { task: 'TASK-702', label: 'Trend detector (Google Trends + niche-specific feeds)' },
        { task: 'TASK-703', label: 'Competitor intelligence dashboard' },
      ]}
    />
  )
}
