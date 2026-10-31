'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { previewMarkdownAction, savePostAction } from '@/app/admin/posts/actions'
import { TagField } from '@/components/admin/TagField'

export type EditorCategory = { id: string; name: string; path: string }
export type EditorTag = { slug: string; name: string }

export type EditorLabels = {
  title: string
  summary: string
  category: string
  tags: string
  slug: string
  body: string
  preview: string
  save: string
  saving: string
  saved: string
  publish: string
  unpublish: string
  archive: string
  conflict: string
  reload: string
  tagPlaceholder: string
  tagRemove: string
}

export type EditorPost = {
  id: string
  title: string
  summary: string | null
  slug: string
  bodyMd: string
  categoryId: string
  tags: EditorTag[]
  status: 'draft' | 'published' | 'archived'
  updatedAt: string
}

/**
 * 文章编辑器。左栏写 Markdown，右栏预览。
 * 预览走服务端渲染器（同一个 renderMarkdown），不在客户端塞 Shiki。
 */
export function MarkdownEditor({
  post,
  categories,
  tags,
  labels,
}: {
  post?: EditorPost
  categories: EditorCategory[]
  tags: EditorTag[]
  labels: EditorLabels
}) {
  const router = useRouter()

  const [title, setTitle] = useState(post?.title ?? '')
  const [summary, setSummary] = useState(post?.summary ?? '')
  const [slug, setSlug] = useState(post?.slug ?? '')
  const [categoryId, setCategoryId] = useState(post?.categoryId ?? categories[0]?.id ?? '')
  const [tagNames, setTagNames] = useState<string[]>(post?.tags.map((tag) => tag.name) ?? [])
  const [bodyMd, setBodyMd] = useState(post?.bodyMd ?? '')
  const [preview, setPreview] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const refreshPreview = useCallback((value: string) => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      void previewMarkdownAction(value).then((result) => setPreview(result.html))
    }, 500)
  }, [])

  useEffect(() => {
    refreshPreview(bodyMd)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [bodyMd, refreshPreview])

  async function save() {
    setPending(true)
    setStatus(null)
    setError(null)

    const formData = new FormData()
    if (post) {
      formData.set('postId', post.id)
      formData.set('expectedUpdatedAt', post.updatedAt)
    }
    formData.set('title', title)
    formData.set('summary', summary)
    formData.set('slug', slug)
    formData.set('categoryId', categoryId)
    // 逗号分隔，服务端按逗号拆开并自动建不存在的标签。
    formData.set('tags', tagNames.join(','))
    formData.set('bodyMd', bodyMd)

    const result = await savePostAction(formData)
    setPending(false)

    if (!result.ok) {
      setError(result.message ?? '保存失败')
      return
    }

    setStatus(labels.saved)
    if (!post && result.postId) {
      router.push(`/admin/posts/${result.postId}`)
      return
    }
    router.refresh()
  }

  const conflict = error !== null && error.includes('他人')

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="font-mono text-xs text-ink-muted">{labels.title}</span>
          <input
            value={title}
            onChange={(event) => {
              setTitle(event.target.value)
              refreshPreview(bodyMd)
            }}
            className="mt-1 w-full border border-rule bg-surface px-3 py-2 text-ink outline-none focus-visible:border-accent"
          />
        </label>

        <label className="block sm:col-span-2">
          <span className="font-mono text-xs text-ink-muted">{labels.summary}</span>
          <textarea
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            rows={2}
            className="mt-1 w-full border border-rule bg-surface px-3 py-2 text-ink outline-none focus-visible:border-accent"
          />
        </label>

        <label className="block">
          <span className="font-mono text-xs text-ink-muted">{labels.category}</span>
          <select
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
            className="mt-1 w-full border border-rule bg-surface px-3 py-2 text-ink outline-none focus-visible:border-accent"
          >
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.path}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="font-mono text-xs text-ink-muted">{labels.slug}</span>
          <input
            value={slug}
            onChange={(event) => setSlug(event.target.value)}
            placeholder="auto"
            className="mt-1 w-full border border-rule bg-surface px-3 py-2 font-mono text-sm text-ink outline-none focus-visible:border-accent"
          />
        </label>

        <div className="block sm:col-span-2">
          <span className="font-mono text-xs text-ink-muted">{labels.tags}</span>
          <div className="mt-1 w-full border border-rule bg-surface px-2 py-1.5 focus-within:border-accent">
            <TagField
              initialTags={post?.tags.map((tag) => tag.name) ?? []}
              labels={{
                placeholder:
                  tags.length > 0 ? labels.tagPlaceholder + '：' + tags.map((tag) => tag.name).join(', ') : labels.tagPlaceholder,
                remove: labels.tagRemove,
              }}
              onChange={setTagNames}
            />
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <p className="mb-1 font-mono text-xs text-ink-muted">{labels.body}</p>
          <textarea
            value={bodyMd}
            onChange={(event) => {
              setBodyMd(event.target.value)
              refreshPreview(event.target.value)
            }}
            rows={24}
            spellCheck={false}
            className="w-full border border-rule bg-surface px-3 py-2 font-mono text-sm text-ink outline-none focus-visible:border-accent"
          />
        </div>

        <div>
          <p className="mb-1 font-mono text-xs text-ink-muted">{labels.preview}</p>
          <div
            className="prose min-h-[24rem] overflow-auto border border-rule bg-surface px-4 py-3"
            dangerouslySetInnerHTML={{ __html: preview }}
          />
        </div>
      </div>

      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => void save()}
          disabled={pending}
          className="bg-accent px-3 py-2 text-sm text-paper hover:bg-accent-hover disabled:opacity-60"
        >
          {pending ? labels.saving : labels.save}
        </button>

        {status ? <span className="text-sm text-success">{status}</span> : null}

        {error ? (
          <span className="flex items-center gap-2 text-sm text-danger">
            {error}
            {conflict ? (
              <button
                type="button"
                onClick={() => router.refresh()}
                className="underline underline-offset-4"
              >
                {labels.reload}
              </button>
            ) : null}
          </span>
        ) : null}
      </div>
    </div>
  )
}
