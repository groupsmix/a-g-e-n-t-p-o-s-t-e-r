/**
 * Cluster — groups videos by topic. Two strategies:
 *
 *   1. keyword-overlap (cheap, always-on default)
 *      Tokenise titles into stems, pick top-K terms, group videos
 *      sharing ≥ N stem matches into the same bucket. Fast, free,
 *      deterministic.
 *
 *   2. llm-label (opt-in)
 *      Once buckets exist, ask the LLM for a short human label per
 *      bucket. Only runs when an LLMClient is supplied.
 *
 * Both strategies preserve niche separation — we never cluster
 * videos across niches because they're already segmented inputs.
 */

import type { LLMClient, TopicCluster, TrendConfig, Video } from '../types.js'

const STOP = new Set([
  'the', 'a', 'an', 'in', 'on', 'of', 'and', 'or', 'is', 'are', 'was',
  'were', 'i', 'you', 'we', 'my', 'your', 'with', 'for', 'to', 'this',
  'that', 'how', 'what', 'why', 'best', 'top', 'new', 'video', 'youtube',
  'official', 'shorts', 'review', '2026', '2025', '2024', 'vs',
])

export interface ClusterInput {
  videos: Video[]
  llm?: LLMClient
  config: TrendConfig
  signal?: AbortSignal
}

export interface ClusterOutput {
  clusters: TopicCluster[]
  usage: { clusterInputTokens: number; clusterOutputTokens: number }
}

export async function clusterTopics(input: ClusterInput): Promise<ClusterOutput> {
  const byNiche = new Map<string, Video[]>()
  for (const v of input.videos) {
    const arr = byNiche.get(v.niche) ?? []
    arr.push(v)
    byNiche.set(v.niche, arr)
  }

  const clusters: TopicCluster[] = []
  let usage = { clusterInputTokens: 0, clusterOutputTokens: 0 }

  for (const [niche, videos] of byNiche.entries()) {
    const nicheClusters = keywordCluster(videos, niche, input.config.maxClustersPerNiche)
    clusters.push(...nicheClusters)
  }

  // Optional LLM labelling pass — one call labels all clusters.
  if (input.llm && clusters.length) {
    try {
      const sample = clusters.map((c) => ({
        id: c.id,
        keywordLabel: c.label,
        sampleTitles: c.videoIds.slice(0, 3).map((id) => {
          const v = input.videos.find((x) => x.id === id)
          return v?.title ?? ''
        }),
      }))
      const completion = await input.llm.complete({
        model: input.config.clusterModel,
        maxTokens: 1024,
        temperature: 0.3,
        messages: [
          {
            role: 'system',
            content:
              'Relabel each cluster with a short human-readable topic name (3–6 words). ' +
              'Return strict JSON: { "<clusterId>": "<label>" }. JSON only.',
          },
          { role: 'user', content: JSON.stringify(sample) },
        ],
        signal: input.signal,
      })
      const parsed = parseJsonLoose(completion.text) as Record<string, string> | undefined
      if (parsed) {
        for (const c of clusters) {
          if (typeof parsed[c.id] === 'string') c.label = parsed[c.id]
        }
      }
      usage = {
        clusterInputTokens: completion.usage.inputTokens,
        clusterOutputTokens: completion.usage.outputTokens,
      }
    } catch {
      // keep keyword labels
    }
  }

  return { clusters, usage }
}

function keywordCluster(videos: Video[], niche: string, maxClusters: number): TopicCluster[] {
  if (!videos.length) return []

  // 1. tokenise each title
  const tokensByVideo = new Map<string, string[]>()
  for (const v of videos) {
    tokensByVideo.set(v.id, tokenise(v.title))
  }

  // 2. find candidate keywords (top by document frequency)
  const docFreq = new Map<string, number>()
  for (const tokens of tokensByVideo.values()) {
    for (const t of new Set(tokens)) {
      docFreq.set(t, (docFreq.get(t) ?? 0) + 1)
    }
  }
  const keywords = Array.from(docFreq.entries())
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxClusters)
    .map(([k]) => k)

  // 3. assign each video to its best keyword (greedy)
  const buckets = new Map<string, Video[]>()
  for (const v of videos) {
    const tokens = tokensByVideo.get(v.id) ?? []
    const matched = keywords.find((k) => tokens.includes(k))
    if (!matched) continue
    const arr = buckets.get(matched) ?? []
    arr.push(v)
    buckets.set(matched, arr)
  }

  return Array.from(buckets.entries()).map(([keyword, vids], i): TopicCluster => {
    const views = vids.map((v) => v.views ?? 0)
    return {
      id: `${niche}-c${i + 1}`,
      niche,
      label: keyword,
      videoIds: vids.map((v) => v.id),
      totalViews: views.reduce((a, b) => a + b, 0),
      medianViews: median(views),
    }
  })
}

function tokenise(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w))
}

function median(nums: number[]): number {
  if (!nums.length) return 0
  const sorted = nums.slice().sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
}

function parseJsonLoose(text: string): unknown {
  const s = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  try {
    return JSON.parse(s)
  } catch {
    const m = s.match(/\{[\s\S]*\}/)
    if (!m) return undefined
    try {
      return JSON.parse(m[0])
    } catch {
      return undefined
    }
  }
}
