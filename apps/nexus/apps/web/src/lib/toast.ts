type ToastType = 'error' | 'success' | 'info'

interface ToastMessage {
  id: number
  type: ToastType
  text: string
}

let nextId = 0
const listeners = new Set<(toasts: ToastMessage[]) => void>()
let toasts: ToastMessage[] = []

function notify() {
  const snapshot = [...toasts]
  listeners.forEach((fn) => fn(snapshot))
}

function addToast(type: ToastType, text: string, duration = 4000) {
  const id = nextId++
  toasts = [...toasts, { id, type, text }]
  notify()
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id)
    notify()
  }, duration)
}

export const toast = {
  error: (text: string) => addToast('error', text),
  success: (text: string) => addToast('success', text),
  info: (text: string) => addToast('info', text),
}

export function subscribeToasts(fn: (toasts: ToastMessage[]) => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export type { ToastMessage }
