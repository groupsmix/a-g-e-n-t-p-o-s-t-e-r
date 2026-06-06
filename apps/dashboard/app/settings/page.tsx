'use client'

import * as React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type KeyRow, type KeyGroup, type KeyTestResponse } from '@/lib/api'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  Eye,
  EyeOff,
  Lock,
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Loader2,
  ExternalLink,
  Save,
  PlayCircle,
} from 'lucide-react'

/**
 * Settings — API key vault manager.
 *
 * Lists every provider key NEXUS knows about (16 KEY_SPECS in nexus-api),
 * grouped by category. Each row shows whether the key is configured, an
 * obfuscated tail of the stored value, and a per-integration "Test" button
 * that pings the provider with the stored credential.
 *
 * Storage layer: AES-256-GCM at-rest in Cloudflare KV (see
 * `services/credentials/crypto.ts`). The KEK is bound as a Workers secret.
 * The dashboard never sees decrypted values for already-stored keys — only
 * masks (last 4 chars). The plaintext only flows through this page when the
 * user is actively typing a new value to save.
 */
export default function SettingsPage(): JSX.Element {
  const queryClient = useQueryClient()
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['keys'],
    queryFn: () => api.keys.list(),
    staleTime: 10_000,
  })

  const [drafts, setDrafts] = React.useState<Record<string, string>>({})
  const [reveal, setReveal] = React.useState<Record<string, boolean>>({})
  const [testResults, setTestResults] = React.useState<
    Record<string, { state: 'idle' | 'running' | 'ok' | 'fail'; message?: string; latencyMs?: number }>
  >({})

  const saveMutation = useMutation({
    mutationFn: (payload: Record<string, string>) => api.keys.save(payload),
    onSuccess: async () => {
      setDrafts({})
      await queryClient.invalidateQueries({ queryKey: ['keys'] })
    },
  })

  const handleTest = async (key: string): Promise<void> => {
    setTestResults((prev) => ({ ...prev, [key]: { state: 'running' } }))
    try {
      const res: KeyTestResponse = await api.keys.test(key)
      setTestResults((prev) => ({
        ...prev,
        [key]: {
          state: res.ok ? 'ok' : 'fail',
          message: res.message,
          latencyMs: res.latency_ms,
        },
      }))
    } catch (err) {
      setTestResults((prev) => ({
        ...prev,
        [key]: { state: 'fail', message: err instanceof Error ? err.message : 'ping failed' },
      }))
    }
  }

  const handleSave = (): void => {
    if (Object.keys(drafts).length === 0) return
    saveMutation.mutate(drafts)
  }

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading vault…
      </div>
    )
  }

  if (isError || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Settings</CardTitle>
          <CardDescription className="text-red-400">
            Failed to load keys: {error instanceof Error ? error.message : 'unknown error'}
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  // Group the rows.
  const groups: KeyGroup[] = ['AI', 'Publishing', 'Social', 'Email']
  const byGroup: Record<KeyGroup, KeyRow[]> = { AI: [], Publishing: [], Social: [], Email: [] }
  for (const row of data.keys) byGroup[row.group].push(row)

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            API keys, models, workflows. Encrypted at rest with AES-256-GCM. Never serialised into a
            prompt.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <VaultStatus kekConfigured={data.kek_configured} />
        </div>
      </div>

      {!data.kek_configured && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-400">
              <ShieldAlert className="h-4 w-4" /> KEK not configured
            </CardTitle>
            <CardDescription>
              The vault refuses to write new keys until a Key-Encryption-Key is bound to the
              worker. Set one with: <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">wrangler secret put KEK</code>
              {' '}— value should be 64 hex chars (32 bytes).
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {groups.map((g) => (
        <Card key={g}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span>{g}</span>
              <Badge variant="outline" className="text-xs">
                {byGroup[g].filter((r) => r.configured).length}/{byGroup[g].length} configured
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {byGroup[g].map((row) => (
              <KeyRowItem
                key={row.key}
                row={row}
                draft={drafts[row.key] ?? ''}
                reveal={reveal[row.key] ?? false}
                test={testResults[row.key]}
                onDraftChange={(v) =>
                  setDrafts((prev) => {
                    const next = { ...prev }
                    if (v === '') delete next[row.key]
                    else next[row.key] = v
                    return next
                  })
                }
                onToggleReveal={() =>
                  setReveal((prev) => ({ ...prev, [row.key]: !prev[row.key] }))
                }
                onTest={() => void handleTest(row.key)}
              />
            ))}
          </CardContent>
        </Card>
      ))}

      <div className="sticky bottom-4 flex items-center justify-between rounded-xl border bg-card/95 p-3 shadow-lg backdrop-blur">
        <div className="text-sm text-muted-foreground">
          {Object.keys(drafts).length === 0
            ? 'No unsaved changes.'
            : `${Object.keys(drafts).length} key(s) edited.`}
          {saveMutation.isSuccess && (
            <span className="ml-2 text-emerald-400">Saved.</span>
          )}
          {saveMutation.isError && (
            <span className="ml-2 text-red-400">
              {saveMutation.error instanceof Error ? saveMutation.error.message : 'save failed'}
            </span>
          )}
        </div>
        <Button
          onClick={handleSave}
          disabled={Object.keys(drafts).length === 0 || saveMutation.isPending}
        >
          {saveMutation.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Save changes
        </Button>
      </div>
    </div>
  )
}

function VaultStatus({ kekConfigured }: { kekConfigured: boolean }): JSX.Element {
  return kekConfigured ? (
    <Badge className="gap-1 bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25">
      <ShieldCheck className="h-3 w-3" /> Vault armed
    </Badge>
  ) : (
    <Badge className="gap-1 bg-amber-500/15 text-amber-400 hover:bg-amber-500/25">
      <ShieldAlert className="h-3 w-3" /> No KEK
    </Badge>
  )
}

interface KeyRowItemProps {
  row: KeyRow
  draft: string
  reveal: boolean
  test: { state: 'idle' | 'running' | 'ok' | 'fail'; message?: string; latencyMs?: number } | undefined
  onDraftChange: (v: string) => void
  onToggleReveal: () => void
  onTest: () => void
}

function KeyRowItem({
  row,
  draft,
  reveal,
  test,
  onDraftChange,
  onToggleReveal,
  onTest,
}: KeyRowItemProps): JSX.Element {
  const isEdited = draft.length > 0
  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <code className="rounded bg-background px-1.5 py-0.5 font-mono text-xs">{row.key}</code>
            {row.configured && row.encrypted && (
              <Badge variant="outline" className="gap-1 text-[10px]">
                <Lock className="h-2.5 w-2.5" /> encrypted
              </Badge>
            )}
            {row.configured && !row.encrypted && (
              <Badge variant="outline" className="gap-1 text-[10px] text-amber-400">
                <ShieldAlert className="h-2.5 w-2.5" /> legacy plaintext
              </Badge>
            )}
            <span className="text-xs text-muted-foreground">
              {row.worker === 'ai' ? 'AI worker' : 'API worker'}
            </span>
          </div>
          <p className="mt-1 text-sm">{row.label}</p>
          {row.help && (
            <a
              href={row.help.startsWith('http') ? row.help : undefined}
              target={row.help.startsWith('http') ? '_blank' : undefined}
              rel="noreferrer"
              className={cn(
                'mt-0.5 inline-flex items-center gap-1 text-xs',
                row.help.startsWith('http')
                  ? 'text-primary hover:underline'
                  : 'text-muted-foreground',
              )}
            >
              {row.help}
              {row.help.startsWith('http') && <ExternalLink className="h-3 w-3" />}
            </a>
          )}
        </div>
        <TestPill test={test} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="flex flex-1 items-center gap-2 rounded-md border bg-background px-2">
          <input
            type={reveal ? 'text' : 'password'}
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            placeholder={row.masked ?? 'paste new value…'}
            className="flex-1 bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground"
            spellCheck={false}
            autoComplete="off"
          />
          {(isEdited || row.configured) && (
            <button
              type="button"
              onClick={onToggleReveal}
              className="rounded p-1 text-muted-foreground hover:bg-muted"
              aria-label={reveal ? 'hide' : 'reveal'}
            >
              {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          )}
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={onTest}
          disabled={!row.configured && !isEdited}
        >
          {test?.state === 'running' ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <PlayCircle className="mr-1.5 h-3.5 w-3.5" />
          )}
          Test
        </Button>
        {isEdited && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDraftChange('')}
            className="text-xs"
          >
            Clear
          </Button>
        )}
      </div>
    </div>
  )
}

function TestPill({
  test,
}: {
  test: { state: 'idle' | 'running' | 'ok' | 'fail'; message?: string; latencyMs?: number } | undefined
}): JSX.Element | null {
  if (!test || test.state === 'idle') return null
  if (test.state === 'running') {
    return (
      <Badge variant="outline" className="gap-1">
        <Loader2 className="h-3 w-3 animate-spin" /> testing…
      </Badge>
    )
  }
  if (test.state === 'ok') {
    return (
      <Badge className="gap-1 bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25">
        <CheckCircle2 className="h-3 w-3" />
        ok{test.latencyMs ? ` . ${test.latencyMs}ms` : ''}
      </Badge>
    )
  }
  return (
    <Badge
      className="gap-1 bg-red-500/15 text-red-400 hover:bg-red-500/25"
      title={test.message}
    >
      <XCircle className="h-3 w-3" />
      fail
    </Badge>
  )
}
