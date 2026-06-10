// ============================================================
// Search Registry
// ============================================================
// Defines web-search providers separate from LLMs.

import type { SearchProviderEntry, TaskType } from './types'

export const SEARCH_REGISTRY: Partial<Record<TaskType, SearchProviderEntry[]>> = {
  research_market: [
    { id: 'tavily', name: 'Tavily Search', provider: 'tavily', secretKey: 'TAVILY_API_KEY', rank: 1, isFree: false, why: 'Built for AI agents. Returns clean structured web data.', costPerSearch: 0.005 },
    { id: 'exa', name: 'Exa Neural', provider: 'exa', secretKey: 'EXA_API_KEY', rank: 2, isFree: false, why: 'Finds by meaning. Discovers emerging niches.', costPerSearch: 0.005 },
    { id: 'serpapi', name: 'SerpAPI', provider: 'serpapi', secretKey: 'SERPAPI_KEY', rank: 3, isFree: false, why: 'Raw Google results. Reliable trend backup.', costPerSearch: 0.01 },
  ],

  research_keywords: [
    { id: 'dataforseo', name: 'DataForSEO', provider: 'dataforseo', secretKey: 'DATAFORSEO_KEY', rank: 1, isFree: false, why: 'Most accurate keyword volume + difficulty data.', costPerSearch: 0.001 },
    { id: 'serpapi', name: 'SerpAPI', provider: 'serpapi', secretKey: 'SERPAPI_KEY', rank: 2, isFree: false, why: 'See exactly what pages rank.', costPerSearch: 0.01 },
    { id: 'exa', name: 'Exa Neural', provider: 'exa', secretKey: 'EXA_API_KEY', rank: 3, isFree: false, why: 'Semantic keyword discovery.', costPerSearch: 0.005 },
  ],

  research_competitors: [
    { id: 'tavily', name: 'Tavily Search', provider: 'tavily', secretKey: 'TAVILY_API_KEY', rank: 1, isFree: false, why: 'Scrapes competitor listings cleanly.', costPerSearch: 0.005 },
  ],

  trend_analysis: [
    { id: 'tavily', name: 'Tavily Search', provider: 'tavily', secretKey: 'TAVILY_API_KEY', rank: 1, isFree: false, why: 'Freshest web data for trend detection.', costPerSearch: 0.005 },
    { id: 'exa', name: 'Exa Neural', provider: 'exa', secretKey: 'EXA_API_KEY', rank: 2, isFree: false, why: 'Semantic trend discovery.', costPerSearch: 0.005 },
  ],
}
