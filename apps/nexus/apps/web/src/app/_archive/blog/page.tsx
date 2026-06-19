'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  FileText, Plus, Loader2, Eye, Pencil, Trash2, Send,
  Search, Tag, ExternalLink,
} from 'lucide-react'
import { api, type BlogPost } from '@/lib/api'
import { PageHeader, PageBody } from '@/components/shell/AppShell'

type View = 'list' | 'generate' | 'edit'

export default function BlogPage() {
  const [posts, setPosts] = useState<BlogPost[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<View>('list')
  const [editPost, setEditPost] = useState<BlogPost | null>(null)

  // Generate form
  const [genNiche, setGenNiche] = useState('')
  const [genKeywords, setGenKeywords] = useState('')
  const [genTone, setGenTone] = useState('professional, helpful')
  const [generating, setGenerating] = useState(false)

  // Edit form
  const [editTitle, setEditTitle] = useState('')
  const [editSlug, setEditSlug] = useState('')
  const [editContent, setEditContent] = useState('')
  const [editMeta, setEditMeta] = useState('')
  const [editKeywords, setEditKeywords] = useState('')
  const [saving, setSaving] = useState(false)

  const [filter, setFilter] = useState<string>('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.getBlogPosts({ status: filter || undefined })
      setPosts(res.posts)
      setTotal(res.total)
    } catch { /* ignore */ }
    setLoading(false)
  }, [filter])

  useEffect(() => { load() }, [load])

  async function handleGenerate() {
    if (!genNiche.trim()) return
    setGenerating(true)
    try {
      const res = await api.generateBlogPost({
        niche: genNiche,
        keywords: genKeywords || undefined,
        tone: genTone || undefined,
      })
      if (res.post) {
        openEditor(res.post)
        await load()
      }
    } catch { /* ignore */ }
    setGenerating(false)
  }

  function openEditor(post: BlogPost) {
    setEditPost(post)
    setEditTitle(post.title)
    setEditSlug(post.slug)
    setEditContent(post.content)
    setEditMeta(post.meta_description || '')
    setEditKeywords(post.keywords || '')
    setView('edit')
  }

  async function handleSave() {
    if (!editPost) return
    setSaving(true)
    try {
      await api.updateBlogPost(editPost.id, {
        title: editTitle,
        slug: editSlug,
        content: editContent,
        meta_description: editMeta || null,
        keywords: editKeywords || null,
      })
      setView('list')
      await load()
    } catch { /* ignore */ }
    setSaving(false)
  }

  async function handlePublish(id: string) {
    try {
      await api.publishBlogPost(id)
      await load()
      if (editPost?.id === id) {
        setEditPost({ ...editPost, status: 'published', published_at: new Date().toISOString() })
      }
    } catch { /* ignore */ }
  }

  async function handleDelete(id: string) {
    try {
      await api.deleteBlogPost(id)
      if (editPost?.id === id) setView('list')
      await load()
    } catch { /* ignore */ }
  }

  // -------- Generate View --------
  if (view === 'generate') {
    return (
      <>
        <PageHeader
          title={<span className="flex items-center gap-2"><FileText className="h-6 w-6" /> Generate Blog Post</span>}
          subtitle="AI will write an SEO-optimized blog post for your niche."
          actions={
            <button onClick={() => setView('list')} className="text-sm text-muted-foreground hover:text-foreground">
              ← Back to posts
            </button>
          }
        />
        <PageBody className="space-y-4 max-w-2xl">
          <div>
            <label className="block text-sm font-medium mb-1">Niche / Topic *</label>
            <input
              value={genNiche}
              onChange={(e) => setGenNiche(e.target.value)}
              placeholder="e.g. AI productivity tools for freelancers"
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Target Keywords</label>
            <input
              value={genKeywords}
              onChange={(e) => setGenKeywords(e.target.value)}
              placeholder="e.g. AI tools, freelancer productivity, automation"
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Tone</label>
            <input
              value={genTone}
              onChange={(e) => setGenTone(e.target.value)}
              placeholder="e.g. professional, helpful"
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <button
            onClick={handleGenerate}
            disabled={generating || !genNiche.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {generating ? 'Generating…' : 'Generate Post'}
          </button>
        </PageBody>
      </>
    )
  }

  // -------- Edit View --------
  if (view === 'edit' && editPost) {
    return (
      <>
        <PageHeader
          title={<span className="flex items-center gap-2"><Pencil className="h-6 w-6" /> Edit Post</span>}
          subtitle={`Editing: ${editPost.title}`}
          actions={
            <div className="flex items-center gap-2">
              {editPost.status === 'draft' && (
                <button
                  onClick={() => handlePublish(editPost.id)}
                  className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                >
                  <Send className="h-4 w-4" /> Publish
                </button>
              )}
              <button onClick={() => setView('list')} className="text-sm text-muted-foreground hover:text-foreground">
                ← Back
              </button>
            </div>
          }
        />
        <PageBody className="space-y-4 max-w-3xl">
          <div>
            <label className="block text-sm font-medium mb-1">Title</label>
            <input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Slug</label>
            <input
              value={editSlug}
              onChange={(e) => setEditSlug(e.target.value)}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm font-mono text-xs focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Meta Description</label>
            <input
              value={editMeta}
              onChange={(e) => setEditMeta(e.target.value)}
              maxLength={160}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <span className="text-xs text-muted-foreground">{editMeta.length}/160</span>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Keywords</label>
            <input
              value={editKeywords}
              onChange={(e) => setEditKeywords(e.target.value)}
              placeholder="comma-separated keywords"
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Content (Markdown)</label>
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              rows={20}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-gradient-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
              Save Changes
            </button>
          </div>
        </PageBody>
      </>
    )
  }

  // -------- List View --------
  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-2"><FileText className="h-6 w-6" /> Blog Engine</span>}
        subtitle="AI-generated SEO blog posts to drive organic traffic."
        actions={
          <button
            onClick={() => setView('generate')}
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-primary px-4 py-2.5 text-sm font-medium text-primary-foreground"
          >
            <Plus className="h-4 w-4" /> Generate Blog Post
          </button>
        }
      />
      <PageBody className="space-y-4">
        {/* Filters */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-sm">
            <Search className="h-4 w-4 text-muted-foreground" />
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="bg-transparent text-sm focus:outline-none"
            >
              <option value="">All Posts</option>
              <option value="draft">Drafts</option>
              <option value="published">Published</option>
            </select>
          </div>
          <span className="text-sm text-muted-foreground">{total} post{total !== 1 ? 's' : ''}</span>
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading posts…
          </div>
        )}

        {!loading && posts.length === 0 && (
          <div className="rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground">
            <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No blog posts yet. Click &ldquo;Generate Blog Post&rdquo; to create your first SEO-optimized article.</p>
          </div>
        )}

        {!loading && posts.length > 0 && (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Title</th>
                  <th className="px-4 py-3 font-medium hidden md:table-cell">Keywords</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium hidden sm:table-cell">Created</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {posts.map((post) => (
                  <tr key={post.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium truncate max-w-xs">{post.title}</div>
                      <div className="text-xs text-muted-foreground font-mono truncate max-w-xs">/{post.slug}</div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      {post.keywords ? (
                        <div className="flex flex-wrap gap-1">
                          {post.keywords.split(',').slice(0, 3).map((kw) => (
                            <span key={kw} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">
                              <Tag className="h-3 w-3" />{kw.trim()}
                            </span>
                          ))}
                          {post.keywords.split(',').length > 3 && (
                            <span className="text-xs text-muted-foreground">+{post.keywords.split(',').length - 3}</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        post.status === 'published'
                          ? 'bg-emerald-500/15 text-emerald-400'
                          : 'bg-amber-500/15 text-amber-400'
                      }`}>
                        {post.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs hidden sm:table-cell">
                      {new Date(post.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openEditor(post)} title="Edit" className="p-1.5 rounded-md hover:bg-muted transition-colors">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <a href={`/blog/${post.slug}`} target="_blank" title="View" className="p-1.5 rounded-md hover:bg-muted transition-colors">
                          <Eye className="h-4 w-4" />
                        </a>
                        {post.status === 'draft' && (
                          <button onClick={() => handlePublish(post.id)} title="Publish" className="p-1.5 rounded-md hover:bg-emerald-500/20 text-emerald-400 transition-colors">
                            <Send className="h-4 w-4" />
                          </button>
                        )}
                        <button onClick={() => handleDelete(post.id)} title="Delete" className="p-1.5 rounded-md hover:bg-red-500/20 text-red-400 transition-colors">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PageBody>
    </>
  )
}
