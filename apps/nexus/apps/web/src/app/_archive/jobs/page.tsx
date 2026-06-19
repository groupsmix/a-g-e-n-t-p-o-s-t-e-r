'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Briefcase, Plus, AlertTriangle, Clock, DollarSign } from 'lucide-react'
import { api, type FreelanceJobSummary } from '@/lib/api'
import { PageHeader, PageBody } from '@/components/shell/AppShell'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { EmptyState } from '@/components/shared/EmptyState'

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-500',
  intake_review: 'bg-blue-500',
  needs_owner_input: 'bg-yellow-500',
  planning: 'bg-blue-400',
  owner_plan_approval: 'bg-yellow-500',
  running: 'bg-green-500 animate-pulse',
  ceo_reviewing: 'bg-purple-500',
  revision_required: 'bg-orange-500',
  human_review_needed: 'bg-red-500',
  final_assembly: 'bg-indigo-500',
  qa_review: 'bg-cyan-500',
  ready_for_owner: 'bg-emerald-500',
  delivered: 'bg-green-700',
  archived: 'bg-gray-400',
  client_revision_requested: 'bg-orange-400',
  revision_in_progress: 'bg-orange-500',
  revision_ready: 'bg-emerald-400',
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  intake_review: 'Intake Review',
  needs_owner_input: 'Needs Your Input',
  planning: 'Planning',
  owner_plan_approval: 'Awaiting Approval',
  running: 'Running',
  ceo_reviewing: 'CEO Reviewing',
  revision_required: 'Revision Required',
  human_review_needed: 'Needs Review',
  final_assembly: 'Final Assembly',
  qa_review: 'QA Review',
  ready_for_owner: 'Ready for You',
  delivered: 'Delivered',
  archived: 'Archived',
  client_revision_requested: 'Client Revision',
  revision_in_progress: 'Revising',
  revision_ready: 'Revision Ready',
}

const JOB_TYPE_LABELS: Record<string, string> = {
  landing_page: 'Landing Page',
  seo_article: 'SEO Article',
  copywriting: 'Copywriting',
  pod_product: 'Print on Demand',
  digital_product: 'Digital Product',
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<FreelanceJobSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')

  useEffect(() => {
    loadJobs()
    const interval = setInterval(loadJobs, 10000)
    return () => clearInterval(interval)
  }, [])

  async function loadJobs() {
    try {
      const data = await api.getFreelanceJobs()
      setJobs(data.jobs)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  const filtered = filter === 'all'
    ? jobs
    : filter === 'active'
      ? jobs.filter((j) => !['delivered', 'archived', 'draft'].includes(j.status))
      : filter === 'at_risk'
        ? jobs.filter((j) => j.at_risk)
        : jobs.filter((j) => j.status === filter)

  const atRiskCount = jobs.filter((j) => j.at_risk).length
  const activeCount = jobs.filter((j) => !['delivered', 'archived', 'draft'].includes(j.status)).length
  const needsActionCount = jobs.filter((j) =>
    ['needs_owner_input', 'owner_plan_approval', 'ready_for_owner', 'human_review_needed'].includes(j.status),
  ).length

  if (loading) return <LoadingSpinner />

  return (
    <>
      <PageHeader
        title="Freelance Jobs"
        subtitle={`${activeCount} active · ${needsActionCount} need action${atRiskCount > 0 ? ` · ${atRiskCount} at risk` : ''}`}
        actions={
          <Link
            href="/jobs/new"
            className="flex items-center gap-2 px-4 py-2 bg-white text-black rounded-lg font-medium hover:bg-gray-200 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Job
          </Link>
        }
      />
      <PageBody>
        {/* Filter tabs */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {[
            { key: 'all', label: `All (${jobs.length})` },
            { key: 'active', label: `Active (${activeCount})` },
            { key: 'at_risk', label: `At Risk (${atRiskCount})` },
            { key: 'needs_owner_input', label: 'Needs Input' },
            { key: 'ready_for_owner', label: 'Ready' },
            { key: 'delivered', label: 'Delivered' },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filter === tab.key
                  ? 'bg-white text-black'
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={<Briefcase className="w-5 h-5" />}
            title="No jobs yet"
            description="Create your first freelance job to get started"
            action={
              <Link
                href="/jobs/new"
                className="px-4 py-2 bg-white text-black rounded-lg font-medium hover:bg-gray-200"
              >
                Create Job
              </Link>
            }
          />
        ) : (
          <div className="space-y-3">
            {filtered.map((job) => (
              <Link
                key={job.id}
                href={`/jobs/${job.id}`}
                className="block bg-zinc-900 border border-zinc-800 rounded-lg p-4 hover:border-zinc-600 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_COLORS[job.status] ?? 'bg-gray-500'}`} />
                      <h3 className="font-medium text-white truncate">{job.title}</h3>
                      {job.at_risk && (
                        <span className="flex items-center gap-1 px-2 py-0.5 bg-red-500/20 text-red-400 rounded text-xs font-medium">
                          <AlertTriangle className="w-3 h-3" />
                          AT RISK
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-sm text-zinc-400">
                      <span>{job.client_name}</span>
                      <span className="text-zinc-600">·</span>
                      <span>{JOB_TYPE_LABELS[job.job_type] ?? job.job_type}</span>
                      <span className="text-zinc-600">·</span>
                      <span className="text-xs px-2 py-0.5 rounded bg-zinc-800">
                        {STATUS_LABELS[job.status] ?? job.status}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-zinc-400 flex-shrink-0">
                    {job.budget && (
                      <span className="flex items-center gap-1">
                        <DollarSign className="w-3.5 h-3.5" />
                        {job.budget}
                      </span>
                    )}
                    {job.deadline && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {new Date(job.deadline).toLocaleDateString()}
                      </span>
                    )}
                    <span className="text-xs text-zinc-500">
                      AI: {job.ai_calls_used}/{job.max_ai_calls}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </PageBody>
    </>
  )
}
