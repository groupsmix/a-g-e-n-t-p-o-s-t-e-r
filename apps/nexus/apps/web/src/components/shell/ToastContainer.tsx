'use client'

import { useEffect, useState } from 'react'
import { subscribeToasts, type ToastMessage } from '@/lib/toast'
import { AlertTriangle, CheckCircle, Info, X } from 'lucide-react'

const STYLE: Record<string, string> = {
  error: 'bg-red-900/90 border-red-500/50 text-red-100',
  success: 'bg-green-900/90 border-green-500/50 text-green-100',
  info: 'bg-blue-900/90 border-blue-500/50 text-blue-100',
}

const ICON: Record<string, typeof AlertTriangle> = {
  error: AlertTriangle,
  success: CheckCircle,
  info: Info,
}

export default function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  useEffect(() => subscribeToasts(setToasts), [])

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((t) => {
        const Icon = ICON[t.type] ?? Info
        return (
          <div
            key={t.id}
            className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm shadow-lg animate-in slide-in-from-right ${STYLE[t.type] ?? STYLE.info}`}
          >
            <Icon className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span className="flex-1">{t.text}</span>
          </div>
        )
      })}
    </div>
  )
}
