import './globals.css'
import type { Metadata } from 'next'
import { AppShell } from '@/components/shell/AppShell'
import ToastContainer from '@/components/shell/ToastContainer'
import { ErrorBoundary } from '@/components/shell/ErrorBoundary'
import KeyboardShortcuts from '@/components/shell/KeyboardShortcuts'

export const metadata: Metadata = {
  title: 'NEXUS — AI Product Engine',
  description: 'Personal AI engine for product creation and publishing',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning className="dark">
      <body className="min-h-screen bg-background font-sans antialiased">
        <ErrorBoundary fallbackTitle="Page failed to load">
          <AppShell>{children}</AppShell>
        </ErrorBoundary>
        <ToastContainer />
        <KeyboardShortcuts />
      </body>
    </html>
  )
}
