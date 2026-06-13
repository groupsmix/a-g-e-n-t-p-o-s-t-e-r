import type { ReactNode } from 'react'

export interface ErrorStateProps {
  message?: string
  onRetry?: () => void
  icon?: ReactNode
  className?: string
}

export function ErrorState({
  message = 'Something went wrong.',
  onRetry,
  className = '',
}: ErrorStateProps) {
  return (
    <div className={`flex flex-col items-center gap-3 py-12 text-center ${className}`}>
      <div className="h-8 w-8 rounded-full bg-destructive/10 flex items-center justify-center">
        <svg
          className="h-4 w-4 text-destructive"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="15" y1="9" x2="9" y2="15" />
          <line x1="9" y1="9" x2="15" y2="15" />
        </svg>
      </div>
      <p className="text-sm text-muted-foreground">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="text-xs underline text-muted-foreground hover:text-foreground transition-colors"
        >
          Retry
        </button>
      )}
    </div>
  )
}
