'use client'

export const runtime = 'edge'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Head from 'next/head'
import Link from 'next/link'
import { FileText, ArrowLeft, Calendar, Tag, Loader2 } from 'lucide-react'
import { api, type BlogPost } from '@/lib/api'

export default function BlogPostPage() {
  const params = useParams()
  const slug = params?.slug as string
  const [post, setPost] = useState<BlogPost | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!slug) return
    setLoading(true)
    api.getBlogPost(slug)
      .then((res) => setPost(res.post))
      .catch(() => setError('Post not found'))
      .finally(() => setLoading(false))
  }, [slug])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !post) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <FileText className="h-12 w-12 text-muted-foreground opacity-50" />
        <h1 className="text-xl font-semibold">Post not found</h1>
        <Link href="/blog" className="text-sm text-primary hover:underline">
          ← Back to blog
        </Link>
      </div>
    )
  }

  const keywords = post.keywords?.split(',').map((k) => k.trim()).filter(Boolean) || []

  return (
    <>
      <Head>
        <title>{post.title}</title>
        {post.meta_description && <meta name="description" content={post.meta_description} />}
        {post.keywords && <meta name="keywords" content={post.keywords} />}
        <meta property="og:title" content={post.title} />
        {post.meta_description && <meta property="og:description" content={post.meta_description} />}
        <meta property="og:type" content="article" />
        {post.published_at && <meta property="article:published_time" content={post.published_at} />}
      </Head>

      <article className="max-w-3xl mx-auto px-6 py-10">
        {/* Back link */}
        <Link href="/blog" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="h-4 w-4" /> Back to Blog
        </Link>

        {/* Header */}
        <header className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight leading-tight mb-3">
            {post.title}
          </h1>
          {post.meta_description && (
            <p className="text-lg text-muted-foreground leading-relaxed">{post.meta_description}</p>
          )}
          <div className="flex flex-wrap items-center gap-4 mt-4 text-sm text-muted-foreground">
            {post.published_at && (
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="h-4 w-4" />
                {new Date(post.published_at).toLocaleDateString('en-US', {
                  year: 'numeric', month: 'long', day: 'numeric',
                })}
              </span>
            )}
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
              post.status === 'published'
                ? 'bg-emerald-500/15 text-emerald-400'
                : 'bg-amber-500/15 text-amber-400'
            }`}>
              {post.status}
            </span>
          </div>
        </header>

        {/* Keywords */}
        {keywords.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-8">
            {keywords.map((kw) => (
              <span key={kw} className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium">
                <Tag className="h-3 w-3" /> {kw}
              </span>
            ))}
          </div>
        )}

        {/* Content */}
        <div className="prose prose-invert prose-headings:font-semibold prose-headings:tracking-tight prose-a:text-primary max-w-none">
          <MarkdownContent content={post.content} />
        </div>
      </article>
    </>
  )
}

function MarkdownContent({ content }: { content: string }) {
  const lines = content.split('\n')
  const elements: React.ReactNode[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (line.startsWith('### ')) {
      elements.push(<h3 key={i} className="text-lg font-semibold mt-6 mb-2">{line.slice(4)}</h3>)
    } else if (line.startsWith('## ')) {
      elements.push(<h2 key={i} className="text-xl font-semibold mt-8 mb-3">{line.slice(3)}</h2>)
    } else if (line.startsWith('# ')) {
      elements.push(<h1 key={i} className="text-2xl font-bold mt-8 mb-3">{line.slice(2)}</h1>)
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      const items: string[] = []
      while (i < lines.length && (lines[i].startsWith('- ') || lines[i].startsWith('* '))) {
        items.push(lines[i].slice(2))
        i++
      }
      elements.push(
        <ul key={`ul-${i}`} className="list-disc pl-6 space-y-1 my-3">
          {items.map((item, idx) => <li key={idx}>{item}</li>)}
        </ul>
      )
      continue
    } else if (/^\d+\.\s/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s/, ''))
        i++
      }
      elements.push(
        <ol key={`ol-${i}`} className="list-decimal pl-6 space-y-1 my-3">
          {items.map((item, idx) => <li key={idx}>{item}</li>)}
        </ol>
      )
      continue
    } else if (line.startsWith('> ')) {
      elements.push(
        <blockquote key={i} className="border-l-4 border-primary/30 pl-4 italic text-muted-foreground my-4">
          {line.slice(2)}
        </blockquote>
      )
    } else if (line.startsWith('```')) {
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      elements.push(
        <pre key={`code-${i}`} className="rounded-lg bg-muted/50 p-4 text-sm overflow-x-auto my-4">
          <code>{codeLines.join('\n')}</code>
        </pre>
      )
    } else if (line.trim() === '') {
      elements.push(<div key={i} className="h-2" />)
    } else {
      elements.push(<p key={i} className="leading-relaxed my-2">{renderInline(line)}</p>)
    }
    i++
  }

  return <>{elements}</>
}

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return <em key={i}>{part.slice(1, -1)}</em>
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={i} className="bg-muted/50 px-1 py-0.5 rounded text-sm">{part.slice(1, -1)}</code>
    }
    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
    if (linkMatch) {
      return <a key={i} href={linkMatch[2]} className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">{linkMatch[1]}</a>
    }
    return part
  })
}
