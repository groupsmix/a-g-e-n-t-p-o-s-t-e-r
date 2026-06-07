import { describe, it, expect } from 'vitest'
import { RuleIntentRouter } from '../adapters/intent'
import { runVoiceTurn } from './index'
import type { Brain, SpeechToText, TextToSpeech, AudioBlob } from '../types'

const fakeAudio: AudioBlob = { bytes: new Uint8Array([0]), mime: 'audio/wav' }

describe('RuleIntentRouter', () => {
  it('matches publish.next and extracts platform slot', async () => {
    const router = new RuleIntentRouter()
    const intent = await router.classify('publish the next post on linkedin')
    expect(intent.id).toBe('publish.next')
    expect(intent.slots.platform).toBe('linkedin')
  })
  it('falls back to free-text', async () => {
    const router = new RuleIntentRouter()
    const intent = await router.classify('how do quaternions work')
    expect(intent.id).toBe('free-text')
  })
})

describe('runVoiceTurn', () => {
  it('short-circuits when the intent is handled', async () => {
    const stt: SpeechToText = { transcribe: async () => ({ text: 'publish the next post' }) }
    const tts: TextToSpeech = { synthesise: async () => fakeAudio }
    const brain: Brain = { reply: async () => ({ text: 'should-not-be-called' }) }
    const r = await runVoiceTurn({
      stt, router: new RuleIntentRouter(), brain, tts,
      shortcircuit: async (intent) => intent.id === 'publish.next' ? { text: 'On it.' } : null,
    }, fakeAudio)
    expect(r.reply.text).toBe('On it.')
  })
  it('falls through to the brain otherwise', async () => {
    const stt: SpeechToText = { transcribe: async () => ({ text: 'tell me a joke' }) }
    const tts: TextToSpeech = { synthesise: async () => fakeAudio }
    const brain: Brain = { reply: async () => ({ text: 'no jokes here.' }) }
    const r = await runVoiceTurn({ stt, router: new RuleIntentRouter(), brain, tts }, fakeAudio)
    expect(r.reply.text).toBe('no jokes here.')
  })
})
