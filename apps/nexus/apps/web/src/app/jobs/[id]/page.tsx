'use client'

export const runtime = 'edge'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Play, Pause, X, Check, RotateCcw, MessageSquare,
  AlertTriangle, Clock, DollarSign, FileText, ChevronDown, ChevronUp,
  Zap, Eye,
} from 'lucide-react'
import { api, type FreelanceJobDetail, type FreelanceTaskInfo, type FreelanceEventInfo } from '@/lib/api'
import { PageHeader, PageBody } from '@/components/shell/AppShell'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-500', intake_review: 'bg-blue-500', needs_owner_input: 'bg-yellow-500',
  planning: 'bg-blue-400', owner_plan_approval: 'bg-yellow-500', running: 'bg-green-500',
  ceo_reviewing: 'bg-purple-500', revision_required: 'bg-orange-500',
  human_review_needed: 'bg-red-500', final_assembly: 'bg-indigo-500', qa_review: 'bg-cyan-500',
  ready_for_owner: 'bg-emerald-500', delivered: 'bg-green-700', archived: 'bg-gray-400',
  client_revision_requested: 'bg-orange-400', revision_in_progress: 'bg-orange-500',
  revision_ready: 'bg-emerald-400',
  // task statuses
  queued: 'bg-gray-500', submitted: 'bg-blue-500', accepted: 'bg-green-500',
  needs_revision: 'bg-orange-500', blocked: 'bg-red-500', failed: 'bg-red-700',
}

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [data, setData] = useState<FreelanceJobDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState('')
  const [noteInput, setNoteInput] = useState('')
  const [infoInput, setInfoInput] = useState('')
  const [revisionInput, setRevisionInput] = useState('')
  const [revisionTaskId, setRevisionTaskId] = useState<string | null>(null)
  const [showEvents, setShowEvents] = useState(false)

  const load = useCallback(async () => {
    try {
      const result = await api.getFreelanceJob(id)
      setData(result)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
    const interval = setInterval(load, 5000)
    return () => clearInterval(interval)
  }, [load])

  async function doAction(action: string, fn: () => Promise<unknown>) {
    setActionLoading(action)
    try {
      await fn()
      await load()
    } catch {
      // ignore
    } finally {
      setActionLoading('')
    }
  }

  if (loading || !data) return <LoadingSpinner />

  const { job, tasks, events } = data
  const qualityScore = job.quality_score_json ? JSON.parse(job.quality_score_json) : null
  const plan = job.plan_json ? JSON.parse(job.plan_json) : null
  const missingInfo = job.missing_info_json ? JSON.parse(job.missing_info_json) : null

  return (
    <>
      <PageHeader
        title={job.title}
        subtitle={`${job.client_name} · ${job.job_type.replace('_', ' ')}`}
        actions={
          <div className="flex items-center gap-2">
            {job.status === 'ready_for_owner' && (
              <Link
                href={`/jobs/${id}/deliverable`}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-500"
              >
                <Eye className="w-4 h-4" />
                View Deliverable
              </Link>
            )}
            <Link href="/jobs" className="flex items-center gap-2 text-zinc-400 hover:text-white">
              <ArrowLeft className="w-4 h-4" />
              Back
            </Link>
          </div>
        }
      />
      <PageBody>
        <div className="space-y-6">
          {/* Status bar */}
          <div className="flex items-center gap-4 p-4 bg-zinc-900 border border-zinc-800 rounded-lg">
            <span className={`w-3 h-3 rounded-full ${STATUS_COLORS[job.status] ?? 'bg-gray-500'} ${job.status === 'running' ? 'animate-pulse' : ''}`} />
            <span className="text-white font-medium">{job.status.replace(/_/g, ' ').toUpperCase()}</span>
            {job.current_stage && (
              <span className="text-zinc-500">Stage: {job.current_stage}</span>
            )}
            <div className="ml-auto flex items-center gap-4 text-sm text-zinc-400">
              {job.budget && (
                <span className="flex items-center gap-1">
                  <DollarSign className="w-3.5 h-3.5" />{job.budget}
                </span>
              )}
              {job.deadline && (
                <span className={`flex items-center gap-1 ${job.at_risk ? 'text-red-400' : ''}`}>
                  <Clock className="w-3.5 h-3.5" />
                  {new Date(job.deadline).toLocaleString()}
                  {job.at_risk && <AlertTriangle className="w-3.5 h-3.5 text-red-400" />}
                </span>
              )}
              <span>AI: {job.ai_calls_used}/{job.max_ai_calls}</span>
            </div>
          </div>

          {/* Owner action buttons */}
          <div className="flex gap-2 flex-wrap">
            {job.status === 'draft' && (
              <ActionBtn icon={Play} label="Start Job" loading={actionLoading === 'start'}
                onClick={() => doAction('start', () => api.startFreelanceJob(id))} color="green" />
            )}
            {job.status === 'owner_plan_approval' && (
              <ActionBtn icon={Check} label="Approve Plan" loading={actionLoading === 'approve-plan'}
                onClick={() => doAction('approve-plan', () => api.approvePlan(id))} color="green" />
            )}
            {job.status === 'ready_for_owner' && (
              <ActionBtn icon={Check} label="Approve Deliverable" loading={actionLoading === 'approve'}
                onClick={() => doAction('approve', () => api.approveJob(id))} color="green" />
            )}
            {!['delivered', 'archived', 'draft'].includes(job.status) && (
              <>
                <ActionBtn icon={Pause} label="Pause" loading={actionLoading === 'pause'}
                  onClick={() => doAction('pause', () => api.pauseJob(id))} />
                <ActionBtn icon={X} label="Cancel" loading={actionLoading === 'cancel'}
                  onClick={() => doAction('cancel', () => api.cancelJob(id))} color="red" />
              </>
            )}
            {job.status === 'human_review_needed' && (
              <ActionBtn icon={Play} label="Resume" loading={actionLoading === 'resume'}
                onClick={() => doAction('resume', () => api.resumeJob(id))} color="green" />
            )}
            {job.status === 'delivered' && (
              <ActionBtn icon={RotateCcw} label="Client Revision" loading={actionLoading === 'client-rev'}
                onClick={() => {
                  const fb = prompt('Enter client feedback:')
                  if (fb) doAction('client-rev', () => api.clientRevision(id, fb))
                }} />
            )}
          </div>

          {/* Needs owner input */}
          {job.status === 'needs_owner_input' && missingInfo && (
            <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
              <h3 className="text-yellow-400 font-medium mb-2">CEO needs more info</h3>
              <ul className="list-disc list-inside text-sm text-zinc-300 mb-3">
                {(Array.isArray(missingInfo) ? missingInfo : [missingInfo]).map((item: unknown, i: number) => (
                  <li key={i}>{String(item)}</li>
                ))}
              </ul>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={infoInput}
                  onChange={(e) => setInfoInput(e.target.value)}
                  placeholder="Provide the missing info..."
                  className="flex-1 px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white text-sm"
                />
                <button
                  onClick={() => {
                    if (infoInput) {
                      doAction('provide-info', () => api.provideInfo(id, infoInput))
                      setInfoInput('')
                    }
                  }}
                  className="px-4 py-2 bg-yellow-600 text-white rounded-lg text-sm font-medium"
                >
                  Send
                </button>
              </div>
            </div>
          )}

          {/* Plan display */}
          {plan && (
            <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-lg">
              <h3 className="text-white font-medium mb-2">Execution Plan</h3>
              <p className="text-sm text-zinc-400 mb-3">{plan.approach}</p>
              {plan.risks?.length > 0 && (
                <div className="text-sm text-orange-400 mb-2">
                  Risks: {plan.risks.join(', ')}
                </div>
              )}
              <div className="text-xs text-zinc-500">
                {plan.estimated_steps} tasks · ~{plan.estimated_ai_calls} AI calls
              </div>
            </div>
          )}

          {/* Quality score */}
          {qualityScore && (
            <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-lg">
              <h3 className="text-white font-medium mb-3">Quality Score</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[
                  { label: 'Brief Match', val: qualityScore.brief_match },
                  { label: 'Completeness', val: qualityScore.completeness },
                  { label: 'Originality', val: qualityScore.originality },
                  { label: 'Client Ready', val: qualityScore.client_readiness },
                  { label: 'Risk Level', val: qualityScore.risk_level },
                  { label: 'Overall', val: qualityScore.overall },
                ].map((s) => (
                  <div key={s.label} className="text-center">
                    <div className={`text-2xl font-bold ${s.val >= 70 ? 'text-green-400' : s.val >= 40 ? 'text-yellow-400' : 'text-red-400'}`}>
                      {s.val}
                    </div>
                    <div className="text-xs text-zinc-500">{s.label}</div>
                  </div>
                ))}
              </div>
              {qualityScore.notes && (
                <p className="text-sm text-zinc-400 mt-3">{qualityScore.notes}</p>
              )}
            </div>
          )}

          {/* Task board */}
          <div>
            <h3 className="text-white font-medium mb-3">Tasks ({tasks.length})</h3>
            <div className="space-y-2">
              {tasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  jobId={id}
                  onForceApprove={() => doAction(`force-${task.id}`, () => api.forceApproveTask(id, task.id))}
                  onRequestRevision={() => setRevisionTaskId(task.id)}
                  actionLoading={actionLoading}
                />
              ))}
            </div>
          </div>

          {/* Revision modal */}
          {revisionTaskId && (
            <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
              <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-6 max-w-lg w-full">
                <h3 className="text-white font-medium mb-3">Request Revision</h3>
                <textarea
                  value={revisionInput}
                  onChange={(e) => setRevisionInput(e.target.value)}
                  rows={4}
                  placeholder="Specific revision instructions..."
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm mb-3 resize-none"
                />
                <div className="flex gap-2 justify-end">
                  <button onClick={() => { setRevisionTaskId(null); setRevisionInput('') }}
                    className="px-4 py-2 bg-zinc-800 text-zinc-300 rounded-lg text-sm">Cancel</button>
                  <button
                    onClick={() => {
                      if (revisionInput && revisionTaskId) {
                        doAction(`rev-${revisionTaskId}`, () => api.requestTaskRevision(id, revisionTaskId, revisionInput))
                        setRevisionTaskId(null)
                        setRevisionInput('')
                      }
                    }}
                    className="px-4 py-2 bg-orange-600 text-white rounded-lg text-sm font-medium"
                  >Send Revision</button>
                </div>
              </div>
            </div>
          )}

          {/* Add note */}
          <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-lg">
            <h3 className="text-white font-medium mb-2 flex items-center gap-2">
              <MessageSquare className="w-4 h-4" />
              Add Note to CEO
            </h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={noteInput}
                onChange={(e) => setNoteInput(e.target.value)}
                placeholder="Add a note for the CEO..."
                className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && noteInput) {
                    doAction('note', () => api.addJobNote(id, noteInput))
                    setNoteInput('')
                  }
                }}
              />
              <button
                onClick={() => {
                  if (noteInput) {
                    doAction('note', () => api.addJobNote(id, noteInput))
                    setNoteInput('')
                  }
                }}
                disabled={!noteInput}
                className="px-4 py-2 bg-zinc-700 text-white rounded-lg text-sm disabled:opacity-50"
              >Send</button>
            </div>
          </div>

          {/* Event log */}
          <div>
            <button
              onClick={() => setShowEvents(!showEvents)}
              className="flex items-center gap-2 text-zinc-400 hover:text-white text-sm font-medium mb-2"
            >
              {showEvents ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              Activity Log ({events.length})
            </button>
            {showEvents && (
              <div className="space-y-1 max-h-80 overflow-y-auto">
                {events.map((evt) => (
                  <EventRow key={evt.id} event={evt} />
                ))}
              </div>
            )}
          </div>
        </div>
      </PageBody>
    </>
  )
}

function TaskCard({
  task, jobId, onForceApprove, onRequestRevision, actionLoading,
}: {
  task: FreelanceTaskInfo
  jobId: string
  onForceApprove: () => void
  onRequestRevision: () => void
  actionLoading: string
}) {
  const [expanded, setExpanded] = useState(false)
  const output = task.output_json ? JSON.parse(task.output_json) : null
  const review = task.ceo_review_json ? JSON.parse(task.ceo_review_json) : null

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${STATUS_COLORS[task.status] ?? 'bg-gray-500'} ${task.status === 'running' ? 'animate-pulse' : ''}`} />
          <span className="text-sm font-medium text-white">{task.title}</span>
          <span className="text-xs text-zinc-500">{task.agent_role}</span>
          {task.revision_count > 0 && (
            <span className="text-xs text-orange-400">v{task.revision_count + 1}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-400">
            {task.status.replace(/_/g, ' ')}
          </span>
          {(task.status === 'human_review_needed' || task.status === 'needs_revision') && (
            <button onClick={onForceApprove}
              disabled={actionLoading === `force-${task.id}`}
              className="text-xs px-2 py-1 bg-green-700 text-white rounded hover:bg-green-600 disabled:opacity-50">
              Force Approve
            </button>
          )}
          {task.status === 'accepted' && (
            <button onClick={onRequestRevision}
              className="text-xs px-2 py-1 bg-orange-700 text-white rounded hover:bg-orange-600">
              Revise
            </button>
          )}
          <button onClick={() => setExpanded(!expanded)} className="text-zinc-500 hover:text-white">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 space-y-2 text-sm">
          {output && (
            <div className="p-2 bg-zinc-800 rounded">
              <div className="text-zinc-500 text-xs mb-1">Output</div>
              <p className="text-zinc-300">{output.summary}</p>
              {output.deliverable && (
                <pre className="mt-2 text-xs text-zinc-400 whitespace-pre-wrap max-h-40 overflow-y-auto">
                  {typeof output.deliverable === 'string' ? output.deliverable.slice(0, 1000) : JSON.stringify(output.deliverable, null, 2).slice(0, 1000)}
                </pre>
              )}
              {output.confidence !== undefined && (
                <div className="text-xs text-zinc-500 mt-1">Confidence: {(output.confidence * 100).toFixed(0)}%</div>
              )}
            </div>
          )}
          {review && (
            <div className={`p-2 rounded ${review.decision === 'accepted' ? 'bg-green-900/20' : 'bg-orange-900/20'}`}>
              <div className="text-xs text-zinc-500 mb-1">CEO Review</div>
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-xs font-medium ${review.decision === 'accepted' ? 'text-green-400' : 'text-orange-400'}`}>
                  {review.decision.replace(/_/g, ' ').toUpperCase()}
                </span>
                <span className="text-xs text-zinc-500">Score: {review.score}</span>
              </div>
              {review.failed_checks?.length > 0 && (
                <ul className="list-disc list-inside text-xs text-red-400">
                  {review.failed_checks.map((c: string, i: number) => <li key={i}>{c}</li>)}
                </ul>
              )}
              {review.revision_instructions && (
                <p className="text-xs text-orange-300 mt-1">{review.revision_instructions}</p>
              )}
              {review.owner_warning && (
                <p className="text-xs text-yellow-400 mt-1 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />{review.owner_warning}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function EventRow({ event }: { event: FreelanceEventInfo }) {
  const actorColors: Record<string, string> = {
    owner: 'text-blue-400', ceo: 'text-purple-400', system: 'text-zinc-500',
    research: 'text-cyan-400', strategy: 'text-indigo-400', production: 'text-green-400',
    qa: 'text-yellow-400', client_comm: 'text-pink-400',
  }
  return (
    <div className="flex items-start gap-2 p-2 text-xs">
      <span className={`font-medium min-w-[60px] ${actorColors[event.actor] ?? 'text-zinc-400'}`}>
        {event.actor}
      </span>
      <span className="text-zinc-400 flex-1">{event.message}</span>
      <span className="text-zinc-600 flex-shrink-0">
        {new Date(event.created_at).toLocaleTimeString()}
      </span>
    </div>
  )
}

function ActionBtn({
  icon: Icon, label, onClick, loading = false, color,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  onClick: () => void
  loading?: boolean
  color?: 'green' | 'red'
}) {
  const bg = color === 'green' ? 'bg-green-700 hover:bg-green-600'
    : color === 'red' ? 'bg-red-700 hover:bg-red-600'
      : 'bg-zinc-700 hover:bg-zinc-600'
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`flex items-center gap-1.5 px-3 py-1.5 ${bg} text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors`}
    >
      <Icon className="w-3.5 h-3.5" />
      {loading ? '...' : label}
    </button>
  )
}
