import type { PublishJob, PublishResult, Platform } from '../types.js'

export interface AgentReacherConfig {
  url: string
  apiKey?: string
  fetch?: typeof fetch
}

export async function publishToAgentReacher(
  platforms: Platform[],
  job: Omit<PublishJob, 'platform'>,
  config: AgentReacherConfig
): Promise<PublishResult[]> {
  const f = config.fetch ?? fetch
  const res = await f(config.url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(config.apiKey ? { 'x-api-key': config.apiKey, 'authorization': `Bearer ${config.apiKey}` } : {})
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'publish',
        arguments: {
          platforms,
          title: job.title,
          parts: job.parts,
          mediaUrl: job.media?.[0]?.url ?? undefined,
          meta: job.meta,
        }
      },
      id: 1
    })
  })

  if (!res.ok) {
    const errorText = await res.text().catch(() => res.statusText)
    throw new Error(`AgentReacher MCP error: ${res.status} ${errorText}`)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json = (await res.json()) as any
  if (json.error) {
    throw new Error(`AgentReacher error: ${json.error.message || JSON.stringify(json.error)}`)
  }

  // Assuming MCP tool response returns results in content text block
  const content = json.result?.content?.[0]?.text;
  if (!content) {
    throw new Error('AgentReacher returned empty result')
  }

  try {
    const data = JSON.parse(content) as Array<{ platform: Platform; ok: boolean; postId?: string; url?: string; error?: string }>
    return data.map(r => ({
      ok: r.ok,
      platform: r.platform,
      postId: r.postId,
      url: r.url,
      error: r.error,
    }))
  } catch {
    // If it's not a JSON list, treat it as a single success or failure response
    return platforms.map(p => ({
      ok: true,
      platform: p,
      postId: json.result?.postId ?? undefined,
      url: json.result?.url ?? undefined,
    }))
  }
}
