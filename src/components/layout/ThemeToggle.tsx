'use client'

import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  // 服务端不知道用户的主题，先渲染一个占位，避免 hydration 不一致。
  useEffect(() => setMounted(true), [])

  // system 主题下 theme 是 "system"，拿不到当前实际值；必须用 resolvedTheme，
  // 否则系统深色时第一次点击算出 "dark"，看起来毫无反应。
  const next = resolvedTheme === 'dark' ? 'light' : 'dark'

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label="Toggle theme"
      className="border border-rule bg-surface px-2 py-1 text-sm text-ink-muted hover:border-accent hover:text-ink"
    >
      {mounted ? (resolvedTheme === 'dark' ? '☾' : '☀') : '·'}
    </button>
  )
}
