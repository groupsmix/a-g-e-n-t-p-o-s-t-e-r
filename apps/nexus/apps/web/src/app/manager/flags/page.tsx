'use client'

import { useMemo } from 'react'
import { Flag, RotateCcw } from 'lucide-react'
import { toast } from '@/lib/toast'
import { PageBody, PageHeader } from '@/components/shell/AppShell'
import { useFlagsContext } from '@/components/shell/FlagsProvider'
import type { FeatureFlags, FlagKey } from '@posteragent/types/nexus'

type FlagField = {
  key: FlagKey
  label: string
  description: string
  type?: 'number'
  min?: number
  max?: number
}

const FLAG_GROUPS: Array<{
  title: string
  description: string
  flags: FlagField[]
}> = [
  {
    title: 'Kill Switches',
    description: 'Master controls for the main automation paths.',
    flags: [
      { key: 'daily_run_enabled', label: 'Daily Run', description: 'Enable the main daily content pipeline.' },
      { key: 'dry_run_mode', label: 'Dry Run Mode', description: 'Generate work without publishing it.' },
      { key: 'site_generation_enabled', label: 'Site Generation', description: 'Allow new site generation jobs.' },
    ],
  },
  {
    title: 'Publishing',
    description: 'Turn individual social surfaces on or off.',
    flags: [
      { key: 'auto_publish_tiktok', label: 'TikTok', description: 'Allow auto-publishing to TikTok.' },
      { key: 'auto_publish_instagram_reels', label: 'Instagram Reels', description: 'Allow auto-publishing to Reels.' },
      { key: 'auto_publish_instagram_feed', label: 'Instagram Feed', description: 'Allow auto-publishing to the feed.' },
      { key: 'auto_publish_youtube_shorts', label: 'YouTube Shorts', description: 'Allow auto-publishing to Shorts.' },
      { key: 'auto_publish_twitter', label: 'Twitter/X', description: 'Allow auto-publishing to X.' },
      { key: 'auto_publish_pinterest', label: 'Pinterest', description: 'Allow auto-publishing to Pinterest.' },
      { key: 'auto_publish_linkedin', label: 'LinkedIn', description: 'Allow auto-publishing to LinkedIn.' },
      { key: 'auto_publish_threads', label: 'Threads', description: 'Allow auto-publishing to Threads.' },
    ],
  },
  {
    title: 'Generation',
    description: 'Control expensive generation subsystems.',
    flags: [
      { key: 'video_generation_enabled', label: 'Video Generation', description: 'Allow Remotion video generation.' },
      { key: 'poster_generation_enabled', label: 'Poster Generation', description: 'Allow poster/image generation.' },
      { key: 'voiceover_enabled', label: 'Voiceover', description: 'Allow voiceover generation.' },
    ],
  },
  {
    title: 'Limits',
    description: 'Cost-control caps used by future workflow checks.',
    flags: [
      { key: 'max_posts_per_day', label: 'Max Posts / Day', description: 'Cap total posts per day.', type: 'number', min: 1, max: 100 },
      { key: 'max_videos_per_day', label: 'Max Videos / Day', description: 'Cap video generation per day.', type: 'number', min: 1, max: 50 },
      { key: 'max_sites_per_week', label: 'Max Sites / Week', description: 'Cap new sites created per week.', type: 'number', min: 0, max: 20 },
      { key: 'max_blog_posts_per_day', label: 'Max Blog Posts / Day', description: 'Cap blog generation per day.', type: 'number', min: 0, max: 100 },
    ],
  },
]

export default function FlagsPage() {
  const { flags, loading, setFlag, resetFlags } = useFlagsContext()

  const stats = useMemo(() => {
    const entries = Object.entries(flags) as Array<[keyof FeatureFlags, FeatureFlags[keyof FeatureFlags]]>
    const enabledCount = entries.filter(([, value]) => value === true).length
    const numericCount = entries.filter(([, value]) => typeof value === 'number').length
    return { total: entries.length, enabledCount, numericCount }
  }, [flags])

  async function handleToggle(key: FlagKey, next: boolean) {
    try {
      await setFlag(key, next)
      toast.success('Flag updated')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update flag')
    }
  }

  async function handleNumberChange(key: FlagKey, value: number) {
    try {
      await setFlag(key, value)
      toast.success('Flag updated')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update flag')
    }
  }

  async function handleReset() {
    if (typeof window !== 'undefined' && !window.confirm('Reset all feature flags to defaults?')) {
      return
    }

    try {
      await resetFlags()
      toast.success('Feature flags reset to defaults')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reset flags')
    }
  }

  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-2"><Flag className="h-5 w-5" /> Feature Flags</span>}
        subtitle="Runtime switches and numeric caps backed by Worker KV."
        actions={
          <button
            type="button"
            onClick={() => void handleReset()}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
          >
            <RotateCcw className="h-4 w-4" /> Reset Defaults
          </button>
        }
      />
      <PageBody className="space-y-6">
        <section className="grid gap-4 md:grid-cols-3">
          <StatCard label="Total Flags" value={String(stats.total)} />
          <StatCard label="Enabled Toggles" value={String(stats.enabledCount)} />
          <StatCard label="Numeric Limits" value={String(stats.numericCount)} />
        </section>

        {loading ? (
          <div className="text-sm text-muted-foreground">Loading flags...</div>
        ) : (
          FLAG_GROUPS.map((group) => (
            <section key={group.title} className="rounded-xl border border-border bg-card">
              <div className="border-b border-border px-5 py-4">
                <h2 className="text-sm font-semibold">{group.title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{group.description}</p>
              </div>
              <div>
                {group.flags.map((flag, index) => {
                  const value = flags[flag.key]
                  const hasBorder = index > 0 ? 'border-t border-border' : ''

                  return (
                    <div key={flag.key} className={`flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between ${hasBorder}`}>
                      <div className="min-w-0">
                        <div className="text-sm font-medium">{flag.label}</div>
                        <div className="mt-1 text-sm text-muted-foreground">{flag.description}</div>
                        <div className="mt-1 text-xs text-muted-foreground/80">
                          Key: <code>{flag.key}</code>
                        </div>
                      </div>

                      {flag.type === 'number' ? (
                        <input
                          type="number"
                          min={flag.min}
                          max={flag.max}
                          value={typeof value === 'number' ? value : 0}
                          onChange={(e) => void handleNumberChange(flag.key, Number(e.target.value))}
                          className="w-28 rounded-lg border border-border bg-background px-3 py-2 text-right text-sm outline-none transition-colors focus:border-primary"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => void handleToggle(flag.key, !(value === true))}
                          aria-pressed={value === true}
                          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${value === true ? 'bg-primary' : 'bg-muted'}`}
                        >
                          <span
                            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${value === true ? 'left-[22px]' : 'left-0.5'}`}
                          />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          ))
        )}
      </PageBody>
    </>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
    </div>
  )
}
