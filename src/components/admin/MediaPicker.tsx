'use client'

import { useRef, useState } from 'react'
import { uploadMediaAction } from '@/app/admin/actions'

export type MediaPickerItem = {
  id: string
  url: string
  filename: string
}

export type MediaPickerLabels = {
  upload: string
  uploading: string
  pick: string
  empty: string
}

/**
 * 图片上传 + 媒体库选择。
 * 媒体库页面用它上传；编辑器用它把图片插入 Markdown。
 */
export function MediaPicker({
  items,
  labels,
  onInsert,
}: {
  items: MediaPickerItem[]
  labels: MediaPickerLabels
  onInsert?: (markdown: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function upload() {
    const input = inputRef.current
    if (!input || input.files === null || input.files.length === 0) {
      setError(labels.empty)
      return
    }

    setPending(true)
    setMessage(null)
    setError(null)

    const formData = new FormData()
    for (const file of Array.from(input.files)) {
      formData.append('file', file)
    }

    const result = await uploadMediaAction(formData)
    setPending(false)
    input.value = ''

    if (!result.ok) {
      setError(result.message ?? labels.empty)
      return
    }

    setMessage(result.message ?? null)
    if (onInsert && result.urls) {
      for (const url of result.urls) {
        onInsert(`![](${url})`)
      }
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="font-mono text-xs text-ink-muted">{labels.upload}</span>
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            multiple
            className="mt-1 block text-sm text-ink-muted file:mr-3 file:border file:border-rule file:px-2 file:py-1 file:text-ink"
          />
        </label>
        <button
          type="button"
          onClick={() => void upload()}
          disabled={pending}
          className="bg-accent px-3 py-2 text-sm text-paper hover:bg-accent-hover disabled:opacity-60"
        >
          {pending ? labels.uploading : labels.upload}
        </button>
      </div>

      {message ? <p className="text-sm text-success">{message}</p> : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}

      {items.length > 0 ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {items.map((item) => (
            <li key={item.id} className="border border-rule bg-surface p-2">
              {/* 图片来自本站上传目录，Next 图片优化对本地磁盘不适用。 */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.url} alt={item.filename} className="h-24 w-full object-cover" />
              {onInsert ? (
                <button
                  type="button"
                  onClick={() => onInsert(`![](${item.url})`)}
                  className="mt-1 w-full font-mono text-xs text-accent underline underline-offset-4"
                >
                  {labels.pick}
                </button>
              ) : (
                <p className="mt-1 truncate font-mono text-xs text-ink-muted">{item.filename}</p>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
