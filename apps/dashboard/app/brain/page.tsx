import { ModuleStub } from '@/components/shared/ModuleStub'

export default function BrainPage(): JSX.Element {
  return (
    <ModuleStub
      title="Brain"
      description="Memory, personality, and proactivity layer. Stores who you are, what you care about, and what to do next without being asked."
      status="planned"
      roadmap={[
        { task: 'TASK-200', label: 'Memory ingestion API + embeddings (all-MiniLM-L6-v2 or OpenAI fallback)' },
        { task: 'TASK-201', label: 'Supabase pgvector schema for semantic recall' },
        { task: 'TASK-202', label: 'Memory retrieval service (top-K semantic + filters)' },
        { task: 'TASK-203', label: 'Identity & profile persistence (long-term self-model)' },
        { task: 'TASK-204', label: 'Proactivity engine — surface tasks before user asks' },
      ]}
    />
  )
}
