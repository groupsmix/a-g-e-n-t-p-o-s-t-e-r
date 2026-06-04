'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'

const LIST_PAGES = ['/', '/jobs', '/opportunities', '/competitors', '/ab-testing']

export default function KeyboardShortcuts() {
  const router = useRouter()
  const pathname = usePathname() || '/'

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return

      if (e.key === 'Escape') {
        e.preventDefault()
        router.back()
        return
      }

      if (!LIST_PAGES.some((p) => pathname === p || pathname.startsWith(p + '/'))) return

      const items = document.querySelectorAll<HTMLElement>('[data-nav-item]')
      if (items.length === 0) return

      const current = document.querySelector<HTMLElement>('[data-nav-item][data-active="true"]')
      const currentIdx = current ? Array.from(items).indexOf(current) : -1

      if (e.key === 'j' || e.key === 'J') {
        e.preventDefault()
        const next = Math.min(currentIdx + 1, items.length - 1)
        items.forEach((el, i) => el.setAttribute('data-active', i === next ? 'true' : 'false'))
        items[next]?.scrollIntoView({ block: 'nearest' })
        items[next]?.focus()
      }

      if (e.key === 'k' || e.key === 'K') {
        e.preventDefault()
        const prev = Math.max(currentIdx - 1, 0)
        items.forEach((el, i) => el.setAttribute('data-active', i === prev ? 'true' : 'false'))
        items[prev]?.scrollIntoView({ block: 'nearest' })
        items[prev]?.focus()
      }

      if (e.key === 'Enter') {
        const focused = document.querySelector<HTMLElement>('[data-nav-item][data-active="true"]')
        if (focused) {
          e.preventDefault()
          const link = focused.querySelector('a') ?? focused.closest('a')
          if (link) link.click()
          else focused.click()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [router, pathname])

  return null
}
