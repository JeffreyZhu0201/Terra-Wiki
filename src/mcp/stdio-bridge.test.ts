import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const bridgePath = fileURLToPath(new URL('../../mcp/stdio-bridge.mjs', import.meta.url))

describe('stdio bridge', () => {
  it('reads the endpoint and token from env and forwards bearer auth', () => {
    const src = readFileSync(bridgePath, 'utf8')
    expect(src).toContain('MCP_HTTP_URL')
    expect(src).toContain('MCP_TOKEN')
    expect(src).toContain('Bearer')
  })

  it('forwards a line and writes the response back to stdout', async () => {
    const received: { auth: string | undefined; body: string; session: string | undefined }[] = []

    const server = createServer((request, response) => {
      const chunks: Buffer[] = []
      request.on('data', (chunk: Buffer) => chunks.push(chunk))
      request.on('end', () => {
        received.push({
          auth: request.headers.authorization,
          body: Buffer.concat(chunks).toString('utf8'),
          session: request.headers['mcp-session-id'] as string | undefined,
        })
        response.writeHead(200, {
          'content-type': 'application/json',
          'mcp-session-id': 'session-42',
        })
        response.end(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { ok: true } }))
      })
    })

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : 0

    const child = spawn(process.execPath, [bridgePath], {
      env: { ...process.env, MCP_HTTP_URL: `http://127.0.0.1:${port}/api/mcp`, MCP_TOKEN: 'secret-token' },
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8')
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8')
    })

    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })}\n`)

    await new Promise<void>((resolve) => {
      const timer = setInterval(() => {
        if (stdout.includes('"ok":true')) {
          clearInterval(timer)
          resolve()
        }
      }, 20)
      setTimeout(() => {
        clearInterval(timer)
        resolve()
      }, 5000)
    })

    child.stdin.end()
    await new Promise<void>((resolve) => child.on('close', () => resolve()))
    server.close()

    expect(received.length).toBe(1)
    expect(received[0]?.auth).toBe('Bearer secret-token')
    expect(JSON.parse(received[0]?.body ?? '{}')).toMatchObject({ method: 'tools/list' })
    expect(JSON.parse(stdout.trim())).toMatchObject({ id: 1, result: { ok: true } })
    expect(stderr).toBe('')
  })

  it('passes the session id back on the next request', async () => {
    const sessions: (string | undefined)[] = []

    const server = createServer((request, response) => {
      sessions.push(request.headers['mcp-session-id'] as string | undefined)
      request.resume()
      request.on('end', () => {
        response.writeHead(200, {
          'content-type': 'application/json',
          'mcp-session-id': 'session-7',
        })
        response.end(JSON.stringify({ jsonrpc: '2.0', id: 1, result: {} }))
      })
    })

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : 0

    const child = spawn(process.execPath, [bridgePath], {
      env: { ...process.env, MCP_HTTP_URL: `http://127.0.0.1:${port}/api/mcp`, MCP_TOKEN: 't' },
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    child.stdout.resume()
    child.stderr.resume()

    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1 })}\n`)
    await new Promise((resolve) => setTimeout(resolve, 400))
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 2 })}\n`)
    await new Promise((resolve) => setTimeout(resolve, 400))

    child.stdin.end()
    await new Promise<void>((resolve) => child.on('close', () => resolve()))
    server.close()

    expect(sessions).toEqual([undefined, 'session-7'])
  })

  it('answers with a json-rpc error when the server replies with plain text', async () => {
    // 上游回 401 时给的是纯文本 "Unauthorized"，不是 JSON-RPC。
    // stdout 是 JSON-RPC 通道——原文直写会让客户端解析失败，
    // 把认证失败报成协议错误。
    const server = createServer((request, response) => {
      request.resume()
      request.on('end', () => {
        response.writeHead(401, { 'content-type': 'text/plain' })
        response.end('Unauthorized')
      })
    })

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : 0

    const child = spawn(process.execPath, [bridgePath], {
      env: { ...process.env, MCP_HTTP_URL: `http://127.0.0.1:${port}/api/mcp`, MCP_TOKEN: 'bad' },
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let stdout = ''
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8')
    })

    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'tools/list' })}\n`)

    await new Promise<void>((resolve) => {
      const timer = setInterval(() => {
        if (stdout.includes('"id":7')) {
          clearInterval(timer)
          resolve()
        }
      }, 20)
      setTimeout(() => {
        clearInterval(timer)
        resolve()
      }, 5000)
    })

    child.stdin.end()
    await new Promise<void>((resolve) => child.on('close', () => resolve()))
    server.close()

    // stdout 上只有合法 JSON-RPC：解析得动，且带上原请求的 id。
    const payload = JSON.parse(stdout.trim())
    expect(payload).toMatchObject({
      jsonrpc: '2.0',
      id: 7,
      error: { code: -32000 },
    })
    expect(payload.error.message).toContain('401')
  })

  it('fails loudly when the token is missing', async () => {
    const child = spawn(process.execPath, [bridgePath], {
      env: { ...process.env, MCP_HTTP_URL: 'http://127.0.0.1:1/api/mcp', MCP_TOKEN: '' },
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let stderr = ''
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8')
    })

    const code = await new Promise<number | null>((resolve) => child.on('close', resolve))
    expect(code).toBe(1)
    expect(stderr).toContain('MCP_TOKEN')
  })
})
