'use client'

export const runtime = 'edge'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Check, Copy, FileText } from 'lucide-react'
import { api, type FreelanceJobDetail } from '@/lib/api'
import { PageHeader, PageBody } from '@/components/shell/AppShell'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'

interface FinalOutputData {
  summary?: string
  deliverable?: string
  assumptions?: string[]
  risks?: string[]
}

interface QualityScoreData {
  brief_match: number
  completeness: number
  originality: number
  client_readiness: number
  risk_level: number
  overall: number
}

function safeParseJson<T>(str: string): T | null {
  try {
    return JSON.parse(str) as T
  } catch {
    return null
  }
}

export default function DeliverablePage() {
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<FreelanceJobDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    api.getFreelanceJob(id)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [id])

  function copyText(text: string, label: string) {
    navigator.clipboard.writeText(text)
    setCopied(label)
    setTimeout(() => setCopied(null), 2000)
  }

  if (loading || !data) return <LoadingSpinner />

  const { job } = data
  const finalOutput = job.final_output ? safeParseJson<FinalOutputData>(job.final_output) : null
  const qualityScore = job.quality_score_json ? safeParseJson<QualityScoreData>(job.quality_score_json) : null

  const deliverableText = finalOutput?.deliverable ?? ''
  const assumptions = finalOutput?.assumptions ?? []
  const risks = finalOutput?.risks ?? []

  return (
    <>
      <PageHeader
        title="Final Deliverable"
        subtitle={`${job.title} — ${job.client_name}`}
        actions={
          <Link href={`/jobs/${id}`} className="flex items-center gap-2 text-zinc-400 hover:text-white">
            <ArrowLeft className="w-4 h-4" />
            Back to Job
          </Link>
        }
      />
      <PageBody>
        <div className="max-w-3xl space-y-6">
          {qualityScore && (
            <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-lg">
              <h3 className="text-white font-medium mb-3">CEO Quality Score</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {([
                  { label: 'Brief Match', val: qualityScore.brief_match },
                  { label: 'Completeness', val: qualityScore.completeness },
                  { label: 'Originality', val: qualityScore.originality },
                  { label: 'Client Ready', val: qualityScore.client_readiness },
                  { label: 'Risk Level', val: qualityScore.risk_level },
                  { label: 'Overall', val: qualityScore.overall },
                ] as const).map((s) => (
                  <div key={s.label} className="text-center">
                    <div className={`text-2xl font-bold ${scoreColor(s.val)}`}>{s.val}</div>
                    <div className="text-xs text-zinc-500">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Section title="Deliverable" icon={FileText}>
            <div className="prose prose-invert prose-sm max-w-none">
              {deliverableText ? (
                <pre className="whitespace-pre-wrap text-zinc-300 text-sm">{deliverableText}</pre>
              ) : (
                <p className="text-zinc-500">No deliverable content yet.</p>
              )}
            </div>
            {deliverableText && (
              <CopyButton
                onClick={() => copyText(deliverableText, 'deliverable')}
                copied={copied === 'deliverable'}
              />
            )}
          </Section>

          {job.client_message && (
            <Section title="Client Delivery Message">
              <p className="text-zinc-300 text-sm whitespace-pre-wrap">{job.client_message}</p>
              <CopyButton
                onClick={() => copyText(job.client_message ?? '', 'message')}
                copied={copied === 'message'}
              />
            </Section>
          )}

          {assumptions.length > 0 && (
            <Section title="Assumptions">
              <ul className="list-disc list-inside text-sm text-zinc-400 space-y-1">
                {assumptions.map((a, i) => <li key={i}>{a}</li>)}
              </ul>
            </Section>
          )}

          {risks.length > 0 && (
            <Section title="Risks & Notes">
              <ul className="list-disc list-inside text-sm text-orange-400 space-y-1">
                {risks.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </Section>
          )}

          {job.upsell_suggestion && (
            <Section title="Upsell Opportunity">
              <p className="text-sm text-zinc-300">{job.upsell_suggestion}</p>
            </Section>
          )}

          {finalOutput?.summary && (
            <Section title="Summary of Work Done">
              <p className="text-sm text-zinc-300">{finalOutput.summary}</p>
            </Section>
          )}

          <div className="flex gap-3">
            {job.status === 'ready_for_owner' && (
              <button
                onClick={async () => {
                  await api.approveJob(id)
                  window.location.reload()
                }}
                className="flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-500"
              >
                <Check className="w-4 h-4" />
                Approve & Deliver
              </button>
            )}
          </div>
        </div>
      </PageBody>
    </>
  )
}

function Section({
  title, icon: Icon, children,
}: {
  title: string
  icon?: React.ComponentType<{ className?: string }>
  children: React.ReactNode
}) {
  return (
    <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-lg">
      <h3 className="text-white font-medium mb-3 flex items-center gap-2">
        {Icon && <Icon className="w-4 h-4" />}
        {title}
      </h3>
      {children}
    </div>
  )
}

function CopyButton({ onClick, copied }: { onClick: () => void; copied: boolean }) {
  return (
    <button
      onClick={onClick}
      className="mt-3 flex items-center gap-1.5 text-xs text-zinc-500 hover:text-white transition-colors"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

function scoreColor(val: number): string {
  if (val >= 70) return 'text-green-400'
  if (val >= 40) return 'text-yellow-400'
  return 'text-red-400'
}
