import type { Metadata } from 'next'
import '@/styles/globals.css'
import { Sidebar } from '@/components/layout/Sidebar'
import { TopBar } from '@/components/layout/TopBar'
import { CommandPalette } from '@/components/layout/CommandPalette'
import { Providers } from './providers'

export const metadata: Metadata = {
  title: 'NEXUS — Money Machine',
  description: 'Single-owner all-in-one AI cockpit',
}

export default function RootLayout({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans antialiased">
        <Providers>
          <div className="flex h-screen overflow-hidden">
            <Sidebar />
            <div className="flex flex-1 flex-col overflow-hidden">
              <TopBar />
              <main className="flex-1 overflow-y-auto">
                <div className="container mx-auto max-w-7xl px-6 py-6">{children}</div>
              </main>
            </div>
          </div>
          <CommandPalette />
        </Providers>
      </body>
    </html>
  )
}
