'use client'

import { useState } from 'react'
import { createTokenAction, revokeTokenAction } from '@/app/admin/actions'

export type TokenRow = {
  id: string
  name: string
  authorName: string
  canPublish: boolean
  lastUsedAt: string | null
  revokedAt: string | null
  createdAt: string
}

export type TokenLabels = {
  name: string
  canPublish: string
  issue: string
  plaintext: string
  plaintextHint: string
  saved: string
  close: string
  revoke: string
  revoked: string
  neverUsed: string
  createdAt: string
  lastUsedAt: string
  author: string
}

/**
 * MCP Token 管理。签发后明文只出现这一次——
 * 服务端只存 sha256，刷新页面就再也拿不回来了。
 */
export function TokenList({ tokens, labels }: { tokens: TokenRow[]; labels: TokenLabels }) {
  const [plaintext, setPlaintext] = useState<string | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function issue(formData: FormData) {
    setPending(true)
    setError(null)
    const result = await createTokenAction(formData)
    setPending(false)

    if (!result.ok) {
      setError(result.message ?? '签发失败')
      return
    }
    if (!result.token) {
      setError('签发失败')
      return
    }
    setPlaintext(result.token)
    setConfirmed(false)
  }

  return (
    <div className="space-y-6">
      <form action={issue} className="flex flex-wrap items-end gap-3 text-sm">
        <label className="block">
          <span className="font-mono text-xs text-ink-muted">{labels.name}</span>
          <input
            name="name"
            required
            placeholder="claude-code"
            className="mt-1 block border border-rule bg-surface px-2 py-1.5 font-mono text-ink"
          />
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="canPublish" />
          <span className="font-mono text-xs text-ink-muted">{labels.canPublish}</span>
        </label>
        <button
          type="submit"
          disabled={pending}
          className="bg-accent px-3 py-2 text-paper hover:bg-accent-hover disabled:opacity-60"
        >
          {labels.issue}
        </button>
      </form>

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      {plaintext ? (
        <div className="border border-accent bg-surface px-4 py-3">
          <p className="font-mono text-xs uppercase tracking-wider text-ink-muted">
            {labels.plaintext}
          </p>
          <p className="mt-1 break-all font-mono text-sm text-ink">{plaintext}</p>
          <p className="mt-2 text-xs text-ink-muted">{labels.plaintextHint}</p>
          <label className="mt-2 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            <span>{labels.saved}</span>
          </label>
          <button
            type="button"
            disabled={!confirmed}
            onClick={() => {
              setPlaintext(null)
              setConfirmed(false)
            }}
            className="mt-2 border border-rule px-2 py-1 text-xs hover:border-accent disabled:opacity-40"
          >
            {labels.close}
          </button>
        </div>
      ) : null}

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-rule text-left font-mono text-xs uppercase tracking-wider text-ink-muted">
            <th className="py-2 pr-4 font-normal">{labels.name}</th>
            <th className="py-2 pr-4 font-normal">{labels.author}</th>
            <th className="py-2 pr-4 font-normal">{labels.canPublish}</th>
            <th className="py-2 pr-4 font-normal">{labels.lastUsedAt}</th>
            <th className="py-2 pr-4 font-normal">{labels.createdAt}</th>
            <th className="py-2 font-normal">{labels.revoke}</th>
          </tr>
        </thead>
        <tbody>
          {tokens.map((token) => (
            <tr key={token.id} className="border-b border-rule align-top">
              <td className="py-2.5 pr-4 font-mono text-xs">{token.name}</td>
              <td className="py-2.5 pr-4">{token.authorName}</td>
              <td className="py-2.5 pr-4 font-mono text-xs">
                {token.canPublish ? '✓' : '—'}
              </td>
              <td className="py-2.5 pr-4 font-mono text-xs text-ink-muted">
                {token.lastUsedAt ?? labels.neverUsed}
              </td>
              <td className="py-2.5 pr-4 font-mono text-xs text-ink-muted">
                {token.createdAt.slice(0, 10)}
              </td>
              <td className="py-2.5">
                {token.revokedAt ? (
                  <span className="font-mono text-xs text-ink-muted">{labels.revoked}</span>
                ) : (
                  <form action={revokeTokenAction}>
                    <input type="hidden" name="id" value={token.id} />
                    <button
                      type="submit"
                      className="font-mono text-xs text-danger underline underline-offset-4"
                    >
                      {labels.revoke}
                    </button>
                  </form>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
