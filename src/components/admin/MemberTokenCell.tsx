'use client'

import { useState } from 'react'

export type MemberTokenCellLabels = {
  copyToken: string
  copyConfig: string
  copied: string
}

/**
 * 成员自带的 MCP Token。明文就在库里，点按即复制——
 * 一并给出 MCP 连接配置 JSON，粘进 Agent 配置就能用。
 */
export function MemberTokenCell({
  token,
  labels,
}: {
  token: string
  labels: MemberTokenCellLabels
}) {
  const [copied, setCopied] = useState<'token' | 'config' | null>(null)

  function mcpConfig(): string {
    return JSON.stringify(
      {
        mcpServers: {
          'terra-wiki': {
            type: 'http',
            url: `${window.location.origin}/api/mcp`,
            headers: { Authorization: `Bearer ${token}` },
          },
        },
      },
      null,
      2,
    )
  }

  async function copy(kind: 'token' | 'config', text: string) {
    await navigator.clipboard.writeText(text)
    setCopied(kind)
    setTimeout(() => setCopied(null), 1500)
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => copy('token', token)}
        className="font-mono text-xs text-accent underline underline-offset-4"
      >
        {copied === 'token' ? labels.copied : labels.copyToken}
      </button>
      <button
        type="button"
        onClick={() => copy('config', mcpConfig())}
        className="font-mono text-xs text-ink-muted underline underline-offset-4 hover:text-accent"
      >
        {copied === 'config' ? labels.copied : labels.copyConfig}
      </button>
    </div>
  )
}
