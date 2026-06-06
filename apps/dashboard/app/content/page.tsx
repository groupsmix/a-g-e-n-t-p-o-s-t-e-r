import { ModuleStub } from '@/components/shared/ModuleStub'

export default function ContentPage(): JSX.Element {
  return (
    <ModuleStub
      title="Content"
      description="Video, podcast, posts, articles. One prompt → full multi-format content pack across platforms."
      status="planned"
      roadmap={[
        { task: 'TASK-500', label: 'Remotion compositions registry (already scaffolded)', done: true },
        { task: 'TASK-501', label: 'Voiceover pipeline (ElevenLabs primary + OpenAI fallback)', done: true },
        { task: 'TASK-502', label: 'Long-form article writer + SEO planner' },
        { task: 'TASK-503', label: 'Podcast generator (script → multi-voice → MP3)' },
        { task: 'TASK-504', label: 'Format-aware adapter (one idea → 8 platform-specific posts)' },
      ]}
    />
  )
}
