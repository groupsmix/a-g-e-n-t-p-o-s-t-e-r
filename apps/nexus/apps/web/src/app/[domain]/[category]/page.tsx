'use client'

export const runtime = 'edge'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { api } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { VoiceInput } from '@/components/VoiceInput'
import { Loader2 } from 'lucide-react'
import type { Platform, SocialChannel } from '@posteragent/types/nexus'
import { PageHeader, PageBody } from '@/components/shell/AppShell'

interface FormState {
  language: string
  niche: string
  product_name: string
  description: string
  keywords: string
  selected_platform_ids: string[]
  post_to_social: boolean
  selected_social_channel_ids: string[]
  social_posting_mode: 'auto' | 'manual'
  let_ai_price: boolean
  let_ai_audience: boolean
  let_ai_style: boolean
}

type TextFormKey = 'niche' | 'product_name' | 'description' | 'keywords'
type BoolFormKey = 'let_ai_price' | 'let_ai_audience' | 'let_ai_style'

export default function ProductSetupPage() {
  const params = useParams()
  const router = useRouter()
  const [platforms, setPlatforms] = useState<Platform[]>([])
  const [socialChannels, setSocialChannels] = useState<SocialChannel[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>({
    language: 'en',
    niche: '',
    product_name: '',
    description: '',
    keywords: '',
    selected_platform_ids: [],
    post_to_social: false,
    selected_social_channel_ids: [],
    social_posting_mode: 'manual',
    let_ai_price: true,
    let_ai_audience: true,
    let_ai_style: true,
  })

  useEffect(() => {
    Promise.all([api.getPlatforms(), api.getSocialChannels()])
      .then(([p, s]) => { setPlatforms(p); setSocialChannels(s) })
      .finally(() => setLoading(false))
  }, [])

  const togglePlatform = (id: string) => {
    setForm(f => ({
      ...f,
      selected_platform_ids: f.selected_platform_ids.includes(id)
        ? f.selected_platform_ids.filter(p => p !== id)
        : [...f.selected_platform_ids, id]
    }))
  }

  const toggleSocial = (id: string) => {
    setForm(f => ({
      ...f,
      selected_social_channel_ids: f.selected_social_channel_ids.includes(id)
        ? f.selected_social_channel_ids.filter(s => s !== id)
        : [...f.selected_social_channel_ids, id]
    }))
  }

  const handleStart = async () => {
    setSubmitting(true)
    setError(null)
    try {
      const result = await api.startWorkflow({
        domain_slug: params.domain as string,
        category_slug: params.category as string,
        user_input: form,
      })
      router.push(`/workflow/${result.workflow_id}`)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to start workflow')
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <PageBody>
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </PageBody>
    )
  }

  return (
    <>
      <PageHeader
        title={<span className="capitalize">{params.category}</span>}
        subtitle="All fields are optional. Leave empty and AI does everything."
      />
      <PageBody>
        <div className="max-w-2xl space-y-6">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950 p-3 text-sm text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          {/* Language */}
          <div>
            <label className="text-sm font-medium">Language</label>
            <select
              value={form.language}
              onChange={e => setForm(f => ({ ...f, language: e.target.value }))}
              className="mt-1 w-full border rounded-lg px-3 py-2 text-sm bg-background"
            >
              <option value="en">English</option>
              <option value="fr">French</option>
              <option value="ar">Arabic</option>
              <option value="es">Spanish</option>
              <option value="de">German</option>
            </select>
          </div>

          {/* Optional Fields */}
          {([
            { key: 'niche' as TextFormKey, label: 'Niche', placeholder: 'e.g. "freelancers", "dog moms"', voice: true },
            { key: 'product_name' as TextFormKey, label: 'Product Name', placeholder: 'Leave empty for AI', voice: false },
            { key: 'description' as TextFormKey, label: 'Brief Description', placeholder: 'What this product does', voice: true },
            { key: 'keywords' as TextFormKey, label: 'Keywords', placeholder: 'e.g. "notion, crm, productivity"', voice: true },
          ]).map(({ key, label, placeholder, voice }) => (
            <div key={key}>
              <label className="text-sm font-medium text-muted-foreground">
                {label} <span className="text-xs">(optional)</span>
              </label>
              <div className="mt-1 flex items-center gap-2">
                <Input
                  value={form[key]}
                  onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className="flex-1"
                />
                {voice && (
                  <VoiceInput
                    onTranscript={t =>
                      setForm(f => ({ ...f, [key]: f[key] ? `${f[key]} ${t}` : t }))
                    }
                  />
                )}
              </div>
            </div>
          ))}

          {/* Platform Selection */}
          <div>
            <label className="text-sm font-medium block mb-2">Post to Platforms</label>
            <div className="flex flex-wrap gap-2">
              {platforms.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => togglePlatform(p.id)}
                  className={`px-4 py-2 rounded-full text-sm font-medium border transition-all ${
                    form.selected_platform_ids.includes(p.id)
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background border-input hover:border-primary/50'
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          {/* Social Media */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium">Post to Social Media?</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, post_to_social: true }))}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                    form.post_to_social
                      ? 'bg-primary text-primary-foreground'
                      : 'border border-input'
                  }`}
                >
                  Yes
                </button>
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, post_to_social: false }))}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                    !form.post_to_social
                      ? 'bg-secondary text-secondary-foreground'
                      : 'border border-input'
                  }`}
                >
                  No
                </button>
              </div>
            </div>

            {form.post_to_social && (
              <div className="flex flex-wrap gap-2">
                {socialChannels.map((ch) => (
                  <button
                    key={ch.id}
                    type="button"
                    onClick={() => toggleSocial(ch.id)}
                    className={`px-4 py-2 rounded-full text-sm font-medium border transition-all ${
                      form.selected_social_channel_ids.includes(ch.id)
                        ? 'bg-purple-600 text-white border-purple-600'
                        : 'bg-background border-input hover:border-purple-500/50'
                    }`}
                  >
                    {ch.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* AI Options */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">AI Decisions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {([
                { key: 'let_ai_price' as BoolFormKey, label: 'Let AI suggest price' },
                { key: 'let_ai_audience' as BoolFormKey, label: 'Let AI define target audience' },
                { key: 'let_ai_style' as BoolFormKey, label: 'Let AI choose design style' },
              ]).map(({ key, label }) => (
                <label key={key} className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form[key]}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.checked }))}
                    className="rounded"
                  />
                  <span className="text-sm">{label}</span>
                </label>
              ))}
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            <Button
              onClick={handleStart}
              disabled={submitting}
              className="flex-1"
              size="lg"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Starting...
                </>
              ) : (
                'Start Workflow →'
              )}
            </Button>
          </div>
        </div>
      </PageBody>
    </>
  )
}
