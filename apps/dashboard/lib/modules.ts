import type { DashboardModule } from '@posteragent/types'

/**
 * The 10 top-level cockpit modules. Source of truth for the sidebar.
 * Order here = order in the sidebar.
 */
export const MODULES: ReadonlyArray<DashboardModule & { description: string }> = [
  {
    id: 'brain',
    label: 'Brain',
    icon: 'Brain',
    route: '/brain',
    status: 'planned',
    description: 'Memory, personality, proactivity',
  },
  {
    id: 'research',
    label: 'Research',
    icon: 'Search',
    route: '/research',
    status: 'planned',
    description: 'Deep researcher, RAG, web scrape',
  },
  {
    id: 'builder',
    label: 'Builder',
    icon: 'Hammer',
    route: '/builder',
    status: 'planned',
    description: 'App builder, site factory, product gen',
  },
  {
    id: 'content',
    label: 'Content',
    icon: 'Film',
    route: '/content',
    status: 'planned',
    description: 'Video, podcast, posts, articles',
  },
  {
    id: 'publisher',
    label: 'Publisher',
    icon: 'Send',
    route: '/publisher',
    status: 'beta',
    description: 'All social platforms',
  },
  {
    id: 'analyse',
    label: 'Analyse',
    icon: 'BarChart3',
    route: '/analyse',
    status: 'planned',
    description: 'Brand monitor, stock, trends, finance',
  },
  {
    id: 'autonome',
    label: 'Autonome',
    icon: 'Bot',
    route: '/autonome',
    status: 'beta',
    description: 'Scheduled agents, goal tracker',
  },
  {
    id: 'revenue',
    label: 'Revenue',
    icon: 'TrendingUp',
    route: '/revenue',
    status: 'planned',
    description: 'Affiliate, Gumroad, Amazon, KPIs',
  },
  {
    id: 'leads',
    label: 'Leads',
    icon: 'Users',
    route: '/leads',
    status: 'planned',
    description: 'Lead scraper, CRM, email campaigns',
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: 'Settings',
    route: '/settings',
    status: 'active',
    description: 'API keys, models, workflows',
  },
] as const

export type ModuleId = (typeof MODULES)[number]['id']
