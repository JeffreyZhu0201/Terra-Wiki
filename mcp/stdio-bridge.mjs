#!/usr/bin/env node
// Terra-Wiki MCP 桥接：stdio → HTTP。
//
// 逐行转发，不能等 stdin 结束——MCP 的 initialize 握手是请求—响应式的，
// 一次性读完整个 stdin 会把握手卡死。
//
// 配置：
//   MCP_HTTP_URL  默认 http://localhost:3000/api/mcp
//   MCP_TOKEN     必填，从 /admin/team 复制该成员的 Token

import { createInterface } from 'node:readline'

const url = process.env.MCP_HTTP_URL ?? 'http://localhost:3000/api/mcp'
const token = process.env.MCP_TOKEN

if (!token) {
  process.stderr.write('缺少 MCP_TOKEN 环境变量——先到 /admin/team 复制该成员的 Token 再填进来。\n')
  process.exit(1)
}

// 服务端如果给了会话 id，后续请求要带回去。
let sessionId = null

// 请求行里的 JSON-RPC id。非 JSON-RPC 响应要靠它回一条合法错误。
function requestId(line) {
  try {
    return JSON.parse(line).id ?? null
  } catch {
    return null
  }
}

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
  let payload
  try {
    payload = JSON.parse(text)
  } catch {
    // 服务端回的不是 JSON-RPC（比如 401 的纯文本 "Unauthorized"）。
    // 原文不能直接写进 stdout——那会让客户端解析失败，把认证失败报成
    // 协议错误。改写成一条合法的 JSON-RPC error，原文留在 stderr。
    payload = {
      jsonrpc: '2.0',
      id: requestId(line),
      error: {
        code: -32000,
        message: `HTTP ${response.status}: ${text.trim().slice(0, 300)}`,
      },
    }
  }
  process.stdout.write(`${JSON.stringify(payload)}\n`)

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
