#!/usr/bin/env node
// Terra-Wiki MCP 桥接：stdio → HTTP。
//
// 逐行转发，不能等 stdin 结束——MCP 的 initialize 握手是请求—响应式的，
// 一次性读完整个 stdin 会把握手卡死。
//
// 配置：
//   MCP_HTTP_URL  默认 http://localhost:3000/api/mcp
//   MCP_TOKEN     必填，从 /admin/tokens 签发

import { createInterface } from 'node:readline'

const url = process.env.MCP_HTTP_URL ?? 'http://localhost:3000/api/mcp'
const token = process.env.MCP_TOKEN

if (!token) {
  process.stderr.write('缺少 MCP_TOKEN 环境变量——先到 /admin/tokens 签发一个 Token 再填进来。\n')
  process.exit(1)
}

// 服务端如果给了会话 id，后续请求要带回去。
let sessionId = null

async function forward(line) {
  const headers = {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
    authorization: `Bearer ${token}`,
  }
  if (sessionId) headers['mcp-session-id'] = sessionId

  const response = await fetch(url, { method: 'POST', headers, body: line })

  const nextSession = response.headers.get('mcp-session-id')
  if (nextSession) sessionId = nextSession

  const text = await response.text()
  if (!text.trim()) return

  // stdout 是 JSON-RPC 通道，只写一行一行合法的 JSON。
  try {
    process.stdout.write(`${JSON.stringify(JSON.parse(text))}\n`)
  } catch {
    process.stdout.write(`${text.trim()}\n`)
  }

  if (!response.ok) {
    process.stderr.write(`HTTP ${response.status}: ${text.slice(0, 300)}\n`)
  }
}

// 请求按到达顺序串行处理——响应顺序必须和请求顺序一致。
let queue = Promise.resolve()

const lines = createInterface({ input: process.stdin, crlfDelay: Infinity })

lines.on('line', (line) => {
  const trimmed = line.trim()
  if (!trimmed) return
  queue = queue.then(() => forward(trimmed)).catch((error) => {
    // 错误只走 stderr，绝不污染 stdout。
    process.stderr.write(`转发失败：${error instanceof Error ? error.message : String(error)}\n`)
  })
})

lines.on('close', () => {
  queue.then(() => process.exit(0))
})
