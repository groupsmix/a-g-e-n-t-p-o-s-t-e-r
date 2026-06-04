'use client'

import React from 'react'

// Lightweight, dependency-free markdown renderer for the common cases we
// produce: headings, bold/italic, inline code, links, and bullet/numbered
// lists. Keeps the bundle small and avoids edge-runtime issues.

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  // Order matters: links, then bold, then italic, then code.
  const pattern = /(\[([^\]]+)\]\((https?:\/\/[^\s)]+)\))|(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(`([^`]+)`)/g
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index))
    if (m[1]) {
      nodes.push(
        <a key={`${keyPrefix}-a${i}`} href={m[3]} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 hover:opacity-80">
          {m[2]}
        </a>
      )
    } else if (m[4]) {
      nodes.push(<strong key={`${keyPrefix}-b${i}`} className="font-semibold text-foreground">{m[5]}</strong>)
    } else if (m[6]) {
      nodes.push(<em key={`${keyPrefix}-i${i}`}>{m[7]}</em>)
    } else if (m[8]) {
      nodes.push(<code key={`${keyPrefix}-c${i}`} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">{m[9]}</code>)
    }
    last = m.index + m[0].length
    i++
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

export function Markdown({ children, className = '' }: { children: string; className?: string }) {
  const lines = (children || '').replace(/\r\n/g, '\n').split('\n')
  const blocks: React.ReactNode[] = []
  let i = 0
  let key = 0

  while (i < lines.length) {
    const line = lines[i]

    // Blank line
    if (!line.trim()) { i++; continue }

    // Heading
    const h = /^(#{1,4})\s+(.*)$/.exec(line)
    if (h) {
      const level = h[1].length
      const cls = level <= 1 ? 'text-base font-bold mt-1'
        : level === 2 ? 'text-sm font-bold mt-1'
        : 'text-sm font-semibold mt-1'
      blocks.push(<div key={key++} className={cls}>{renderInline(h[2], `h${key}`)}</div>)
      i++
      continue
    }

    // Unordered list
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ''))
        i++
      }
      blocks.push(
        <ul key={key++} className="my-1 list-disc space-y-1 pl-5">
          {items.map((it, j) => <li key={j}>{renderInline(it, `ul${key}-${j}`)}</li>)}
        </ul>
      )
      continue
    }

    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ''))
        i++
      }
      blocks.push(
        <ol key={key++} className="my-1 list-decimal space-y-1 pl-5">
          {items.map((it, j) => <li key={j}>{renderInline(it, `ol${key}-${j}`)}</li>)}
        </ol>
      )
      continue
    }

    // Paragraph (consume consecutive non-blank, non-structural lines)
    const para: string[] = []
    while (
      i < lines.length && lines[i].trim() &&
      !/^(#{1,4})\s+/.test(lines[i]) &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i])
    ) {
      para.push(lines[i])
      i++
    }
    blocks.push(<p key={key++} className="leading-relaxed">{renderInline(para.join(' '), `p${key}`)}</p>)
  }

  return <div className={`space-y-2 ${className}`}>{blocks}</div>
}
