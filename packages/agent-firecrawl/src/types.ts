/**
 * Firecrawl client contracts (TASK-1001).
 *
 * Four operations cover everything our agents need:
 *   crawl_site         walk a domain and return page markdown
 *   extract_structured pull JSON matching a schema from a URL
 *   monitor_url        diff a URL against a stored snapshot (price /
 *                      stock / status detection)
 *   search_and_scrape  query → top URLs → scrape each
 */

export interface CrawlOptions {
  url: string
  limit?: number
  /** Restrict to URLs matching this glob (Firecrawl includePaths). */
  include_paths?: string[]
  /** Wait for selector before rendering. */
  wait_for?: string
}

export interface CrawlPage {
  url: string
  title?: string
  markdown: string
  metadata?: Record<string, unknown>
}

export interface ExtractOptions {
  url: string
  schema: Record<string, unknown>
  /** Free-text prompt that complements the schema. */
  prompt?: string
}

export interface MonitorOptions {
  url: string
  /** Previous markdown snapshot to diff against. */
  previous_markdown?: string
  /** Field to extract for diffing (price, stock, etc.). */
  watch?: string
}

export interface MonitorResult {
  url: string
  fetched_at: string
  markdown: string
  changed: boolean
  /** When `watch` is set, the parsed value from the page. */
  value?: string | number | null
  /** Hash of the markdown, useful for change detection. */
  fingerprint: string
}

export interface SearchScrapeOptions {
  query: string
  limit?: number
}

export interface SearchScrapeResult {
  query: string
  pages: CrawlPage[]
}

export interface FirecrawlClient {
  crawlSite(opts: CrawlOptions): Promise<CrawlPage[]>
  extractStructured<T = unknown>(opts: ExtractOptions): Promise<T>
  monitorUrl(opts: MonitorOptions): Promise<MonitorResult>
  searchAndScrape(opts: SearchScrapeOptions): Promise<SearchScrapeResult>
}
