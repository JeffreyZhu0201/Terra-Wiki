import { beforeEach, describe, expect, it } from 'vitest'
import { resetDb } from '../../../../tests/db'
import { db } from '../../../server/db/client'
import { createMcpToken } from '../../../server/services/tokens'
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
    const { token } = await createMcpToken({
      actor: { kind: 'user', id: user.id, role: user.role },
      name: 'x',
      canPublish: false,
    })
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
    const { token } = await createMcpToken({
      actor: { kind: 'user', id: user.id, role: user.role },
      name: 'x',
      canPublish: false,
    })

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

  it('records the last used time of the token', async () => {
    const user = (await db.query.users.findFirst())!
    const { token } = await createMcpToken({
      actor: { kind: 'user', id: user.id, role: user.role },
      name: 'x',
      canPublish: false,
    })

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
