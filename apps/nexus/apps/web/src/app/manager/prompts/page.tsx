'use client'

import { useEffect, useState } from 'react'
import { FileCode } from 'lucide-react'
import { api } from '@/lib/api'
import type { PromptTemplate } from '@posteragent/types/nexus'
import { PageHeader, PageBody } from '@/components/shell/AppShell'

const LAYERS = ['master', 'persona', 'role', 'domain', 'category', 'platform', 'social', 'quality']

export default function ManagerPromptsPage() {
  const [layer, setLayer] = useState<string>('master')
  const [prompts, setPrompts] = useState<PromptTemplate[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    api.getPrompts(layer)
      .then(setPrompts)
      .finally(() => setLoading(false))
  }, [layer])

  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-2"><FileCode className="h-5 w-5" /> Prompts</span>}
        subtitle="Editable prompt templates layered into every workflow step."
      />
      <PageBody>
        <div className="flex gap-1 mb-4 flex-wrap">
          {LAYERS.map((l) => (
            <button
              key={l}
              onClick={() => setLayer(l)}
              className={`text-xs px-3 py-1.5 rounded-full border ${layer === l ? 'border-primary bg-primary/10' : 'border-border'}`}
            >
              {l}
            </button>
          ))}
        </div>
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : (
          <ul className="space-y-3">
            {prompts.map((p) => (
              <li key={p.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-semibold">{p.name}</div>
                  <div className="text-xs text-muted-foreground font-mono">{p.layer}</div>
                </div>
                <textarea
                  defaultValue={p.prompt_text}
                  onBlur={(e) => api.updatePrompt(p.id, e.target.value)}
                  className="input min-h-32 w-full font-mono text-xs"
                />
              </li>
            ))}
            {prompts.length === 0 && (
              <div className="text-sm text-muted-foreground">No prompts in this layer yet.</div>
            )}
          </ul>
        )}
      </PageBody>
    </>
  )
}
