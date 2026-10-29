'use client'

import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  // 服务端不知道用户的主题，先渲染一个占位，避免 hydration 不一致。
  useEffect(() => setMounted(true), [])

  const next = theme === 'dark' ? 'light' : 'dark'

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label="Toggle theme"
      className="border border-rule bg-surface px-2 py-1 text-sm text-ink-muted hover:border-accent hover:text-ink"
    >
      {mounted ? (theme === 'dark' ? '☾' : '☀') : '·'}
    </button>
  )
}
