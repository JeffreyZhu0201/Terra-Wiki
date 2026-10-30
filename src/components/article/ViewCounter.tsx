'use client'

import { useEffect } from 'react'

export function ViewCounter({
  postId,
  initialViews,
  label,
}: {
  postId: string
  initialViews: number
  label: string
}) {
  useEffect(() => {
    const payload = JSON.stringify({ postId })
    const blob = new Blob([payload], { type: 'application/json' })

    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/track', blob)
      return
    }

    void fetch('/api/track', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: payload,
      keepalive: true,
    })
  }, [postId])

  return (
    <p className="font-mono text-xs text-ink-muted">
      {initialViews} {label}
    </p>
  )
}
