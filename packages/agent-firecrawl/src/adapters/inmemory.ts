/**
 * In-memory test double. Lets tests drive the high-level surface
 * without spinning up a real Firecrawl client.
 */

import type {
  CrawlOptions, CrawlPage, ExtractOptions, FirecrawlClient,
  MonitorOptions, MonitorResult, SearchScrapeOptions, SearchScrapeResult,
} from '../types'

function fnv1a(input: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0
  }
  return ('00000000' + h.toString(16)).slice(-8)
}

export class InMemoryFirecrawl implements FirecrawlClient {
  pages = new Map<string, CrawlPage>()
  setPage(url: string, markdown: string, title?: string): void {
    this.pages.set(url, { url, markdown, title })
  }
  async crawlSite(opts: CrawlOptions): Promise<CrawlPage[]> {
    return Array.from(this.pages.values()).filter((p) => p.url.startsWith(opts.url)).slice(0, opts.limit ?? 25)
  }
  async extractStructured<T>(opts: ExtractOptions): Promise<T> {
    const page = this.pages.get(opts.url)
    if (!page) throw new Error('no page')
    return { _from: page.url, schema: opts.schema } as unknown as T
  }
  async monitorUrl(opts: MonitorOptions): Promise<MonitorResult> {
    const page = this.pages.get(opts.url)
    const md = page?.markdown ?? ''
    const fp = fnv1a(md)
    return {
      url: opts.url,
      fetched_at: new Date().toISOString(),
      markdown: md,
      changed: opts.previous_markdown !== undefined && fnv1a(opts.previous_markdown) !== fp,
      value: null,
      fingerprint: fp,
    }
  }
  async searchAndScrape(opts: SearchScrapeOptions): Promise<SearchScrapeResult> {
    const q = opts.query.toLowerCase()
    return {
      query: opts.query,
      pages: Array.from(this.pages.values())
        .filter((p) => (p.markdown + (p.title ?? '')).toLowerCase().includes(q))
        .slice(0, opts.limit ?? 5),
    }
  }
}
