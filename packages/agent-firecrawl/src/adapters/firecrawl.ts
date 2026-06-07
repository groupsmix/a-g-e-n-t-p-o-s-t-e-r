/**
 * Firecrawl REST client. Targets the public api.firecrawl.dev surface
 * but the base URL is overridable so callers can point at the
 * self-hosted Firecrawl MCP container.
 *
 *   POST /v1/crawl           crawl_site
 *   POST /v1/extract         extract_structured
 *   POST /v1/scrape          single-page (used by monitor + scrape)
 *   POST /v1/search          search → URLs (then we scrape each)
 */

import type {
  CrawlOptions,
  CrawlPage,
  ExtractOptions,
  FirecrawlClient,
  MonitorOptions,
  MonitorResult,
  SearchScrapeOptions,
  SearchScrapeResult,
} from '../types'

export interface FirecrawlConfig {
  baseUrl?: string
  apiKey: string
}

function fnv1a(input: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0
  }
  return ('00000000' + h.toString(16)).slice(-8)
}

interface ScrapePageResponse {
  success: boolean
  data?: { markdown?: string; html?: string; metadata?: { title?: string; url?: string; [k: string]: unknown } }
}

interface CrawlResponse {
  success: boolean
  data?: Array<{ markdown?: string; metadata?: { title?: string; sourceURL?: string; url?: string } }>
}

interface SearchResponse {
  success: boolean
  data?: Array<{ url: string }>
}

interface ExtractResponse<T> { success: boolean; data?: T }

export class FirecrawlHttpClient implements FirecrawlClient {
  private base: string
  constructor(private cfg: FirecrawlConfig, private fetcher: typeof fetch = fetch) {
    this.base = (cfg.baseUrl ?? 'https://api.firecrawl.dev').replace(/\/$/, '')
  }

  private headers(): Record<string, string> {
    return { authorization: `Bearer ${this.cfg.apiKey}`, 'content-type': 'application/json' }
  }

  async crawlSite(opts: CrawlOptions): Promise<CrawlPage[]> {
    const res = await this.fetcher(`${this.base}/v1/crawl`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        url: opts.url,
        limit: opts.limit ?? 25,
        includePaths: opts.include_paths,
        scrapeOptions: { formats: ['markdown'], waitFor: opts.wait_for },
      }),
    })
    if (!res.ok) throw new Error(`firecrawl crawl ${res.status}`)
    const json = (await res.json()) as CrawlResponse
    return (json.data ?? []).map((d) => ({
      url: d.metadata?.sourceURL ?? d.metadata?.url ?? '',
      title: d.metadata?.title,
      markdown: d.markdown ?? '',
      metadata: d.metadata,
    }))
  }

  async extractStructured<T = unknown>(opts: ExtractOptions): Promise<T> {
    const res = await this.fetcher(`${this.base}/v1/extract`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        urls: [opts.url],
        schema: opts.schema,
        prompt: opts.prompt,
      }),
    })
    if (!res.ok) throw new Error(`firecrawl extract ${res.status}`)
    const json = (await res.json()) as ExtractResponse<T>
    if (!json.success || json.data === undefined) throw new Error('firecrawl extract: no data')
    return json.data
  }

  async monitorUrl(opts: MonitorOptions): Promise<MonitorResult> {
    const page = await this.scrape(opts.url)
    const markdown = page.markdown ?? ''
    const fingerprint = fnv1a(markdown)
    const previousFingerprint = opts.previous_markdown ? fnv1a(opts.previous_markdown) : undefined
    const changed = previousFingerprint !== undefined && previousFingerprint !== fingerprint
    let value: string | number | null = null
    if (opts.watch) {
      const re = new RegExp(`${opts.watch}\\s*[:=]\\s*([^\\n]+)`, 'i')
      const m = markdown.match(re)
      if (m) {
        const raw = m[1]!.trim()
        const num = Number(raw.replace(/[^0-9.\-]/g, ''))
        value = Number.isFinite(num) ? num : raw
      }
    }
    return {
      url: opts.url,
      fetched_at: new Date().toISOString(),
      markdown,
      changed,
      value,
      fingerprint,
    }
  }

  async searchAndScrape(opts: SearchScrapeOptions): Promise<SearchScrapeResult> {
    const res = await this.fetcher(`${this.base}/v1/search`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ query: opts.query, limit: opts.limit ?? 5 }),
    })
    if (!res.ok) throw new Error(`firecrawl search ${res.status}`)
    const json = (await res.json()) as SearchResponse
    const urls = (json.data ?? []).map((d) => d.url).filter(Boolean)
    const pages: CrawlPage[] = []
    for (const url of urls) {
      try {
        const p = await this.scrape(url)
        pages.push({
          url,
          title: p.metadata?.title,
          markdown: p.markdown ?? '',
          metadata: p.metadata,
        })
      } catch {
        /* skip failing pages */
      }
    }
    return { query: opts.query, pages }
  }

  private async scrape(url: string): Promise<NonNullable<ScrapePageResponse['data']>> {
    const res = await this.fetcher(`${this.base}/v1/scrape`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ url, formats: ['markdown'] }),
    })
    if (!res.ok) throw new Error(`firecrawl scrape ${res.status}`)
    const json = (await res.json()) as ScrapePageResponse
    return json.data ?? {}
  }
}
