import { ModuleStub } from '@/components/shared/ModuleStub'

export default function ResearchPage(): JSX.Element {
  return (
    <ModuleStub
      title="Research"
      description="Deep researcher with multi-pass RAG and web scraping. Anything you'd Google, do it here with sources, summaries, and a saved trail."
      status="planned"
      roadmap={[
        { task: 'TASK-300', label: 'Deep researcher agent (Tavily + Firecrawl + Brave)' },
        { task: 'TASK-301', label: 'RAG corpus management (per-project namespaces)' },
        { task: 'TASK-302', label: 'Web scrape job runner (Browser Rendering Worker)' },
        { task: 'TASK-303', label: 'Citation manager — every claim links to a source URL' },
      ]}
    />
  )
}
