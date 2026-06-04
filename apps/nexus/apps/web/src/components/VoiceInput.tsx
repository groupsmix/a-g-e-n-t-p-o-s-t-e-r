'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Mic, MicOff } from 'lucide-react'

// Minimal typings for the browser SpeechRecognition API (not in lib.dom).
interface SpeechRecognitionResultLike {
  0: { transcript: string }
  isFinal: boolean
}
interface SpeechRecognitionEventLike {
  resultIndex: number
  results: { length: number; [i: number]: SpeechRecognitionResultLike }
}
interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  start: () => void
  stop: () => void
  onresult: ((e: SpeechRecognitionEventLike) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
  return w.SpeechRecognition || w.webkitSpeechRecognition || null
}

// Dictate-to-text mic button. Uses the browser's built-in SpeechRecognition
// (free, on-device in Chrome). Renders nothing when unsupported so it never
// shows a dead button. Appends the recognized transcript via onTranscript.
export function VoiceInput({
  onTranscript,
  disabled,
  className = '',
  label,
}: {
  onTranscript: (text: string) => void
  disabled?: boolean
  className?: string
  // When set, renders a wider button with this text next to the mic icon so
  // the voice option is obvious instead of an easy-to-miss icon.
  label?: string
}) {
  const [supported, setSupported] = useState(false)
  const [listening, setListening] = useState(false)
  const recRef = useRef<SpeechRecognitionLike | null>(null)

  useEffect(() => {
    setSupported(getRecognitionCtor() !== null)
    return () => {
      try {
        recRef.current?.stop()
      } catch {
        /* noop */
      }
    }
  }, [])

  const toggle = useCallback(() => {
    if (listening) {
      recRef.current?.stop()
      return
    }
    const Ctor = getRecognitionCtor()
    if (!Ctor) return
    const rec = new Ctor()
    rec.lang = navigator.language || 'en-US'
    rec.continuous = false
    rec.interimResults = false
    rec.onresult = (e) => {
      let text = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) text += e.results[i][0].transcript
      }
      if (text.trim()) onTranscript(text.trim())
    }
    rec.onerror = () => setListening(false)
    rec.onend = () => setListening(false)
    recRef.current = rec
    try {
      rec.start()
      setListening(true)
    } catch {
      setListening(false)
    }
  }, [listening, onTranscript])

  if (!supported) return null

  const sizing = label ? 'h-9 gap-1.5 px-3 text-sm font-medium' : 'h-9 w-9 justify-center'

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={disabled}
      title={listening ? 'Stop dictation' : 'Speak instead of typing'}
      aria-label={listening ? 'Stop dictation' : 'Speak instead of typing'}
      className={`inline-flex shrink-0 items-center rounded-lg border transition disabled:opacity-50 ${sizing} ${
        listening
          ? 'border-red-500 bg-red-500/10 text-red-500 animate-pulse'
          : 'border-border bg-card text-muted-foreground hover:text-foreground'
      } ${className}`}
    >
      {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
      {label && <span>{listening ? 'Listening…' : label}</span>}
    </button>
  )
}
