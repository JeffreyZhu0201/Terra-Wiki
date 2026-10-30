'use client'

import { useState } from 'react'

export type TagFieldLabels = {
  /** 输入框下方的提示文案。 */
  placeholder: string
  /** 移除按钮的 aria-label。 */
  remove: string
}

/**
 * 标签输入。用英文逗号分隔：识别到逗号就把前一段固化成标签块，
 * 输入框里剩下的继续写。标签块带 × 可删。
 *
 * 没见过的标签在保存时由服务端 createTag 自动创建——前端不预建，
 * 否则打了一半的标签也会进库。
 */
export function TagField({
  initialTags,
  labels,
  onChange,
}: {
  initialTags: string[]
  labels: TagFieldLabels
  onChange: (tags: string[]) => void
}) {
  const [tags, setTags] = useState<string[]>(initialTags)
  const [input, setInput] = useState('')

  function commit(next: string[]) {
    // 去重且保持顺序——同名标签只留一个。
    const merged = [...tags, ...next].filter(
      (tag, index, all) => tag !== '' && all.indexOf(tag) === index,
    )
    setTags(merged)
    onChange(merged)
  }

  function handleChange(value: string) {
    if (!value.includes(',')) {
      setInput(value)
      return
    }

    // 逗号之前的全部固化成标签块，逗号之后的留在输入框里继续写。
    const parts = value.split(',')
    const tail = parts.pop() ?? ''
    const done = parts.map((part) => part.trim()).filter((part) => part !== '')
    commit(done)
    setInput(tail)
  }

  function remove(tag: string) {
    const next = tags.filter((item) => item !== tag)
    setTags(next)
    onChange(next)
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 border border-rule bg-surface px-2 py-0.5 font-mono text-xs text-ink"
          >
            {tag}
            <button
              type="button"
              onClick={() => remove(tag)}
              aria-label={`${labels.remove} ${tag}`}
              className="text-ink-muted hover:text-danger"
            >
              ×
            </button>
          </span>
        ))}
        <input
          value={input}
          onChange={(event) => handleChange(event.target.value)}
          onKeyDown={(event) => {
            // 回车也能固化，省得必须打逗号。
            if (event.key === 'Enter') {
              event.preventDefault()
              const value = input.trim()
              if (value === '') return
              commit([value])
              setInput('')
            }
          }}
          placeholder={tags.length === 0 ? labels.placeholder : ''}
          className="min-w-[8rem] flex-1 border-0 bg-transparent px-1 py-0.5 text-sm text-ink outline-none placeholder:text-ink-muted"
        />
      </div>
    </div>
  )
}
