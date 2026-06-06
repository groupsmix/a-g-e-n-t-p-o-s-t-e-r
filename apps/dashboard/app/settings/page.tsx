import { ModuleStub } from '@/components/shared/ModuleStub'

export default function SettingsPage(): JSX.Element {
  return (
    <ModuleStub
      title="Settings"
      description="API keys, models, workflows. Encrypted at rest. Never serialised into a prompt."
      status="active"
      roadmap={[
        { task: 'TASK-103', label: 'Encrypted key vault (AES-256-GCM) + UI manager' },
        { task: 'TASK-110', label: 'Model selector per agent (Claude / GPT / Gemini / local)' },
        { task: 'TASK-111', label: 'Workflow editor (graph view of Mastra workflows)' },
        { task: 'TASK-112', label: 'Per-integration health + test button' },
      ]}
    />
  )
}
