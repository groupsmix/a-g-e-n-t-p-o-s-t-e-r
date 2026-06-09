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

// Blocking pre-hydration script: apply the saved theme + layout to <html>
// BEFORE first paint. Without this the document ships as `class="dark"` and
// the Sidebar's useTheme/useLayout effects only correct it after React mounts,
// so a "light"/"compact" user gets a flash of the dark, expanded layout on
// every load. Reading localStorage here is the standard no-flash pattern and
// is what makes the toggles actually apply on first render (T11).
const THEME_INIT = `(function(){try{
  var d=document.documentElement;
  var t=localStorage.getItem('nexus_theme')||'dark';
  var dark=t==='dark'||(t==='auto'&&window.matchMedia('(prefers-color-scheme: dark)').matches);
  d.classList.remove('dark','light');
  d.classList.add(dark?'dark':'light');
  var l=localStorage.getItem('nexus_layout');
  if(l==='compact'||l==='expanded'||l==='minimal')d.setAttribute('data-layout',l);
}catch(e){}})();`

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning className="dark">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
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
