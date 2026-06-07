/**
 * Tiny rule-based intent router. Covers the half-dozen commands voice
 * users actually want to say without thinking. Anything that doesn't
 * match a rule routes to the Brain as 'free-text'.
 *
 * Rules use case-insensitive RegExp; the first match wins. Slot
 * extraction is regex named-groups.
 */

import type { IntentRouter, VoiceIntent } from '../types'

interface Rule {
  id: string
  pattern: RegExp
  /** Named-group → slot mapping happens automatically. */
  confidence?: number
}

const DEFAULT_RULES: Rule[] = [
  { id: 'publish.next',  pattern: /\bpublish (the )?next( post)?( on (?<platform>[a-z]+))?\b/i },
  { id: 'inbox.summary', pattern: /\b(summarise|summarize|summary of) (my )?inbox\b/i },
  { id: 'leads.top',     pattern: /\b(show|list|read me) (the )?top leads?\b/i },
  { id: 'goals.status',  pattern: /\b(how are|what are) (my |the )?goals?( looking)?\b/i },
  { id: 'revenue.today', pattern: /\brevenue (today|this week|this month)\b/i },
  { id: 'pause.autonome', pattern: /\bpause (the )?autonome( mode)?\b/i },
  { id: 'resume.autonome', pattern: /\bresume (the )?autonome( mode)?\b/i },
]

export class RuleIntentRouter implements IntentRouter {
  constructor(private rules: Rule[] = DEFAULT_RULES) {}
  async classify(text: string): Promise<VoiceIntent> {
    for (const r of this.rules) {
      const m = r.pattern.exec(text)
      if (m) {
        return {
          id: r.id,
          slots: { ...(m.groups ?? {}) } as Record<string, string>,
          confidence: r.confidence ?? 0.9,
        }
      }
    }
    return { id: 'free-text', slots: {}, confidence: 0 }
  }
}
