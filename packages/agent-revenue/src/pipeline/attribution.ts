/**
 * Attribution resolver — given a referring URL (or an affiliate
 * sub-id, or a campaign tag), extract platform / content_id / campaign
 * fields. Pure, no I/O. Adapters call this before they emit events so
 * the aggregator has clean data to pivot on.
 *
 * Heuristics:
 *   utm_source=x         → platform 'x'
 *   utm_content=abc      → content_id 'abc'
 *   utm_campaign=...     → campaign
 *   t.co/x.com host      → platform 'x'
 *   linkedin.com host    → platform 'linkedin'
 *   youtu.be/youtube.com → platform 'youtube'
 *   …
 *
 * Anything we can't resolve becomes `unattributed` (no platform, no
 * content_id) and surfaces in the aggregator's unattributed bucket.
 */

import type { RevenueAttribution } from '../types'

const HOST_PLATFORM: Array<[RegExp, string]> = [
  [/(^|\.)x\.com$/i, 'x'],
  [/(^|\.)t\.co$/i, 'x'],
  [/(^|\.)twitter\.com$/i, 'x'],
  [/(^|\.)linkedin\.com$/i, 'linkedin'],
  [/(^|\.)lnkd\.in$/i, 'linkedin'],
  [/(^|\.)youtube\.com$/i, 'youtube'],
  [/(^|\.)youtu\.be$/i, 'youtube'],
  [/(^|\.)tiktok\.com$/i, 'tiktok'],
  [/(^|\.)instagram\.com$/i, 'instagram'],
  [/(^|\.)reddit\.com$/i, 'reddit'],
  [/(^|\.)substack\.com$/i, 'newsletter'],
  [/(^|\.)beehiiv\.com$/i, 'newsletter'],
]

export function resolveAttribution(input: {
  referring_url?: string
  utm?: Record<string, string>
  affiliate_subid?: string
}): RevenueAttribution {
  const att: RevenueAttribution = {}
  if (input.referring_url) {
    att.referring_url = input.referring_url
    try {
      const u = new URL(input.referring_url)
      for (const [re, plat] of HOST_PLATFORM) {
        if (re.test(u.hostname)) {
          att.platform = plat
          break
        }
      }
      const utm = u.searchParams
      if (utm.get('utm_source') && !att.platform) {
        att.platform = utm.get('utm_source')!.toLowerCase()
      }
      if (utm.get('utm_content')) {
        att.content_id = utm.get('utm_content')!
      }
      if (utm.get('utm_campaign')) {
        att.campaign = utm.get('utm_campaign')!
      }
    } catch {
      /* unparseable URL — keep the raw one */
    }
  }
  if (input.utm) {
    if (input.utm.utm_source && !att.platform) att.platform = input.utm.utm_source.toLowerCase()
    if (input.utm.utm_content && !att.content_id) att.content_id = input.utm.utm_content
    if (input.utm.utm_campaign && !att.campaign) att.campaign = input.utm.utm_campaign
  }
  if (input.affiliate_subid) {
    // Many affiliate networks pack platform:content like "x_abc123" — try.
    const m = /^([a-z]+)[_-](.+)$/i.exec(input.affiliate_subid)
    if (m) {
      if (!att.platform) att.platform = m[1]!.toLowerCase()
      if (!att.content_id) att.content_id = m[2]!
    }
    if (!att.campaign) att.campaign = input.affiliate_subid
  }
  return att
}
