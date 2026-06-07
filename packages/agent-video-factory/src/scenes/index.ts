/**
 * Scene template descriptors.  The renderer worker (Remotion app)
 * registers one React component per kind; this file is the typed
 * contract so the agent and the renderer agree on names + props.
 *
 * The agent itself never imports Remotion — the renderer process
 * does. This barrel is the wire format.
 */

export const SCENE_TEMPLATES = {
  'text-carousel': {
    component: 'TextCarouselScene',
    props: ['bullets', 'caption'] as const,
  },
  'data-viz': {
    component: 'DataVizScene',
    props: ['title', 'series', 'caption'] as const,
  },
  'product-showcase': {
    component: 'ProductShowcaseScene',
    props: ['name', 'price', 'imageUrl', 'bullets', 'caption'] as const,
  },
  'news-reel': {
    component: 'NewsReelScene',
    props: ['headline', 'source', 'caption'] as const,
  },
  'quote-card': {
    component: 'QuoteCardScene',
    props: ['quote', 'author', 'caption'] as const,
  },
} as const

export type SceneTemplateName = keyof typeof SCENE_TEMPLATES
