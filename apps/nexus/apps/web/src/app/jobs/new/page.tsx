'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Briefcase, Send } from 'lucide-react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { PageHeader, PageBody } from '@/components/shell/AppShell'

const JOB_TYPES = [
  { value: 'landing_page', label: 'Landing Page', desc: 'Website landing page with copy and design', engine: 'freelance' },
  { value: 'seo_article', label: 'SEO Article', desc: 'Search-optimized blog post or article', engine: 'freelance' },
  { value: 'copywriting', label: 'Copywriting', desc: 'Product listings, descriptions, or copy packages', engine: 'freelance' },
  { value: 'pod_product', label: 'Print on Demand', desc: 'T-shirts, mugs, stickers, posters with designs', engine: 'pod' },
  { value: 'digital_product', label: 'Digital Product', desc: 'Templates, guides, worksheets, content packs', engine: 'digital' },
]

export default function NewJobPage() {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    client_name: '',
    title: '',
    job_type: 'landing_page',
    brief: '',
    deadline: '',
    budget: '',
    deliverables_required: '',
    links_notes: '',
    priority: 1,
    max_ai_calls: 50,
    max_revision_rounds: 3,
  })

  function updateField(field: string, value: string | number) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.client_name || !form.title || !form.brief) {
      setError('Client name, title, and brief are required')
      return
    }

    setSubmitting(true)
    setError('')
    try {
      const result = await api.createFreelanceJob({
        client_name: form.client_name,
        title: form.title,
        job_type: form.job_type,
        brief: form.brief,
        deadline: form.deadline || undefined,
        budget: form.budget ? parseFloat(form.budget) : undefined,
        deliverables_required: form.deliverables_required || undefined,
        links_notes: form.links_notes || undefined,
        priority: form.priority,
        max_ai_calls: form.max_ai_calls,
        max_revision_rounds: form.max_revision_rounds,
      })
      router.push(`/jobs/${result.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create job')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <PageHeader
        title="New Freelance Job"
        subtitle="Paste your client brief and the CEO will plan the work"
        actions={
          <Link href="/jobs" className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Back
          </Link>
        }
      />
      <PageBody>
        <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Client & Title */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Client Name *</label>
              <input
                type="text"
                value={form.client_name}
                onChange={(e) => updateField('client_name', e.target.value)}
                placeholder="Acme Corp"
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Job Title *</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => updateField('title', e.target.value)}
                placeholder="Product Launch Landing Page"
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
              />
            </div>
          </div>

          {/* Job Type */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Job Type *</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {JOB_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => updateField('job_type', t.value)}
                  className={`p-3 rounded-lg border text-left transition-colors ${
                    form.job_type === t.value
                      ? 'border-white bg-zinc-800 text-white'
                      : 'border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-600'
                  }`}
                >
                  <div className="font-medium text-sm">{t.label}</div>
                  <div className="text-xs text-zinc-500 mt-1">{t.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Brief */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Client Brief *</label>
            <textarea
              value={form.brief}
              onChange={(e) => updateField('brief', e.target.value)}
              rows={6}
              placeholder="Paste the full client brief here. Include what they want, who their audience is, any specific requirements, examples they like, brand voice, etc."
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500 resize-none"
            />
          </div>

          {/* Deadline & Budget */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Deadline</label>
              <input
                type="datetime-local"
                value={form.deadline}
                onChange={(e) => updateField('deadline', e.target.value)}
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-zinc-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Budget ($)</label>
              <input
                type="number"
                value={form.budget}
                onChange={(e) => updateField('budget', e.target.value)}
                placeholder="500"
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
              />
            </div>
          </div>

          {/* Deliverables */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Required Deliverables</label>
            <textarea
              value={form.deliverables_required}
              onChange={(e) => updateField('deliverables_required', e.target.value)}
              rows={3}
              placeholder="List specific deliverables: homepage copy, 3 blog posts, product descriptions, etc."
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500 resize-none"
            />
          </div>

          {/* Links/Notes */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Links, Files & Notes</label>
            <textarea
              value={form.links_notes}
              onChange={(e) => updateField('links_notes', e.target.value)}
              rows={3}
              placeholder="Brand guidelines URL, competitor sites, examples they like/hate, reference docs..."
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500 resize-none"
            />
          </div>

          {/* Advanced settings */}
          <details className="group">
            <summary className="text-sm text-zinc-400 cursor-pointer hover:text-zinc-300">
              Advanced Settings
            </summary>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Priority (1-5)</label>
                <input
                  type="number"
                  min={1}
                  max={5}
                  value={form.priority}
                  onChange={(e) => updateField('priority', parseInt(e.target.value) || 1)}
                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Max AI Calls</label>
                <input
                  type="number"
                  value={form.max_ai_calls}
                  onChange={(e) => updateField('max_ai_calls', parseInt(e.target.value) || 50)}
                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Max Revisions</label>
                <input
                  type="number"
                  value={form.max_revision_rounds}
                  onChange={(e) => updateField('max_revision_rounds', parseInt(e.target.value) || 3)}
                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white text-sm"
                />
              </div>
            </div>
          </details>

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting}
            className="flex items-center gap-2 px-6 py-3 bg-white text-black rounded-lg font-medium hover:bg-gray-200 transition-colors disabled:opacity-50"
          >
            {submitting ? (
              <>Creating...</>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Create Job
              </>
            )}
          </button>
        </form>
      </PageBody>
    </>
  )
}
