import { beforeEach, describe, expect, it } from 'vitest'
import { resetDb } from '../../../../tests/db'
import { db } from '../../../server/db/client'
import { ensureMemberToken } from '../../../server/services/tokens'
import { GET, POST } from './route'

function jsonRpcRequest(body: unknown, token?: string): Request {
  return new Request('http://localhost/api/mcp', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })
}

describe('POST /api/mcp', () => {
  beforeEach(async () => {
    await resetDb()
  })

  it('rejects a request without a bearer token', async () => {
    const response = await POST(jsonRpcRequest({ jsonrpc: '2.0', id: 1, method: 'tools/list' }))
    expect(response.status).toBe(401)
  })

  it('rejects an unknown token', async () => {
    const response = await POST(
      jsonRpcRequest({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, 'nope'),
    )
    expect(response.status).toBe(401)
  })

  it('rejects a revoked token', async () => {
    const user = (await db.query.users.findFirst())!
    const { token } = await ensureMemberToken({ userId: user.id, name: 'test' })
    const { revokeMcpToken } = await import('../../../server/services/tokens')
    const { mcpTokens } = await import('../../../server/db/schema')
    await revokeMcpToken((await db.select().from(mcpTokens))[0]!.id)

    const response = await POST(
      jsonRpcRequest({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, token),
    )
    expect(response.status).toBe(401)
  })

  it('answers tools/list for a valid token', async () => {
    const user = (await db.query.users.findFirst())!
    const { token } = await ensureMemberToken({ userId: user.id, name: 'test' })

    const response = await POST(
      jsonRpcRequest({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, token),
    )
    expect(response.status).toBe(200)

    const payload = (await response.json()) as {
      result: { tools: { name: string }[] }
    }
    const names = payload.result.tools.map((tool) => tool.name)
    expect(names).toContain('create_post')
    expect(names).not.toContain('delete_post')
  })

  it('answers with the service error when an upload exceeds the size limit', async () => {
    const user = (await db.query.users.findFirst())!
    const { token } = await ensureMemberToken({ userId: user.id, name: 'test' })

    // 超过 10 MB 的图片，base64 后约 13.3 MB。transport 的默认 4 MiB 上限
    // 会先一步把它拦成 413，Agent 拿到的是 transport 的英文而不是我们的
    // DomainError——上限必须比 uploadMedia 的 10 MB 宽。
    const oversized = Buffer.alloc(11 * 1024 * 1024).toString('base64')

    const response = await POST(
      jsonRpcRequest(
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name: 'upload_image', arguments: { data: oversized } },
        },
        token,
      ),
    )

    expect(response.status).toBe(200)
    const payload = (await response.json()) as {
      result: { isError?: boolean; content: { text: string }[] }
    }
    expect(payload.result.isError).toBe(true)
    expect(payload.result.content[0]!.text).toContain('文件超过 10MB 上限')
  })

  it('records the last used time of the token', async () => {
    const user = (await db.query.users.findFirst())!
    const { token } = await ensureMemberToken({ userId: user.id, name: 'test' })

    await POST(jsonRpcRequest({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, token))

    const { mcpTokens } = await import('../../../server/db/schema')
    const row = (await db.select().from(mcpTokens))[0]!
    expect(row.lastUsedAt).not.toBeNull()
  })
})

describe('GET /api/mcp', () => {
  it('requires authentication', async () => {
    const response = await GET(new Request('http://localhost/api/mcp'))
    expect(response.status).toBe(401)
  })
})
