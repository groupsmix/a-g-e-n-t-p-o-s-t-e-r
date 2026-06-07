/**
 * The voice pipeline. Drives one turn end-to-end:
 *   audio in → transcript → intent → brain reply (optionally short-circuited
 *   by the intent router) → audio out.
 *
 * Returns the intermediates too so callers can log them.
 */

import type {
  AudioBlob, Brain, BrainReply, IntentRouter, SpeechToText, TextToSpeech, VoiceIntent,
} from '../types'

export interface VoicePipelineInput {
  stt: SpeechToText
  router: IntentRouter
  brain: Brain
  tts: TextToSpeech
  /**
   * Optional shortcut — receives the recognised intent and returns a
   * BrainReply if it can handle it directly (e.g. 'publish.next' just
   * enqueues a task and replies "On it."). When undefined, every turn
   * goes through the Brain.
   */
  shortcircuit?(intent: VoiceIntent): Promise<BrainReply | null>
  /** Optional context retrieval — appended to the system prompt. */
  contextFor?(intent: VoiceIntent, text: string): Promise<string | undefined>
}

export interface VoiceTurnResult {
  transcript: string
  intent: VoiceIntent
  reply: BrainReply
  audio: AudioBlob
}

export async function runVoiceTurn(input: VoicePipelineInput, audio: AudioBlob): Promise<VoiceTurnResult> {
  const transcript = await input.stt.transcribe(audio)
  const intent = await input.router.classify(transcript.text)
  let reply = input.shortcircuit ? await input.shortcircuit(intent) : null
  if (!reply) {
    const context = input.contextFor ? await input.contextFor(intent, transcript.text) : undefined
    reply = await input.brain.reply({ user_text: transcript.text, intent, context })
  }
  const out = await input.tts.synthesise(reply.text)
  return { transcript: transcript.text, intent, reply, audio: out }
}
