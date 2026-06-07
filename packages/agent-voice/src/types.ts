/**
 * Voice interface contracts (TASK-1002).
 *
 * The pipeline is intentionally narrow: audio bytes in, audio bytes
 * out, with the planner / brain pluggable. Each step is an interface
 * so a serverless function can swap any one of them without touching
 * the pipeline.
 *
 *   audio → SpeechToText → IntentRouter → Brain → TextToSpeech → audio
 *
 * IntentRouter is deliberately separate from the Brain so simple
 * commands ("publish next post", "summarise inbox") short-circuit
 * before we hit the LLM. The Brain handles the long tail.
 */

export interface AudioBlob {
  bytes: Uint8Array
  mime: string
}

export interface Transcript {
  text: string
  language?: string
  duration_seconds?: number
}

export interface VoiceIntent {
  /** Stable intent id — 'publish.next', 'inbox.summary', 'free-text', etc. */
  id: string
  /** Filled slots (e.g. { platform: 'x' }). */
  slots: Record<string, string>
  /** Confidence 0..1. <0.5 typically routes to the Brain. */
  confidence: number
}

export interface BrainTurn {
  user_text: string
  intent: VoiceIntent
  context?: string
}

export interface BrainReply {
  text: string
  /** Optional structured actions the orchestrator can dispatch. */
  actions?: Array<{ type: string; payload: Record<string, unknown> }>
}

export interface SpeechToText {
  transcribe(blob: AudioBlob): Promise<Transcript>
}

export interface IntentRouter {
  classify(text: string): Promise<VoiceIntent>
}

export interface Brain {
  reply(turn: BrainTurn): Promise<BrainReply>
}

export interface TextToSpeech {
  synthesise(text: string, opts?: { voice_id?: string }): Promise<AudioBlob>
}
