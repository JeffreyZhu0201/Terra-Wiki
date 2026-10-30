import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { createMcpServer } from '@/mcp/tools'
import type { McpContext } from '@/mcp/context'
import { touchMcpToken, verifyMcpToken } from '@/server/services/tokens'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * 解析 Bearer Token，组装调用身份。
 * Token 吊销后即使哈希对也必须失效——verifyMcpToken 只认未吊销的。
 */
async function authenticate(request: Request): Promise<McpContext | null> {
  const header = request.headers.get('authorization')
  if (!header?.startsWith('Bearer ')) return null

  const token = header.slice('Bearer '.length).trim()
  if (!token) return null

  const verified = await verifyMcpToken(token)
  if (!verified) return null

  // 让后台的「最后使用时间」列有真实数据。
  await touchMcpToken(verified.id)

  return {
    actor: {
      kind: 'token',
      id: verified.id,
      authorId: verified.authorId,
      role: verified.role,
      canPublish: verified.canPublish,
    },
    tokenId: verified.id,
  }
}

export async function POST(request: Request): Promise<Response> {
  const ctx = await authenticate(request)
  if (!ctx) return new Response('Unauthorized', { status: 401 })

  // 每个请求重建一次 server：身份绑在这次请求上，没有跨请求状态。
  const server = createMcpServer(ctx)
  const transport = new WebStandardStreamableHTTPServerTransport({
    // 不给 sessionIdGenerator 就是无状态模式：每个请求独立，不做会话校验。
    enableJsonResponse: true,
    // transport 默认只收 4 MiB，而 upload_image 传的是 base64（10 MB 图片约
    // 13.3 MB）——上限比业务限制还紧，超限时 Agent 拿到的是 transport 的
    // 413 英文而不是我们的 DomainError。放宽到能装下 10 MB 的 base64，
    // 让 uploadMedia 的 10 MB 成为唯一权威上限。
    maxRequestBodySize: 16 * 1024 * 1024,
  })

  await server.connect(transport)
  try {
    return await transport.handleRequest(request)
  } finally {
    await server.close()
  }
}

/**
 * GET 是服务端主动推送的通道。我们没有推送源（工具都是请求—响应），
 * 按 MCP 规范回 405，而不是挂一个永远不结束的 SSE 流。
 */
export async function GET(request: Request): Promise<Response> {
  const ctx = await authenticate(request)
  if (!ctx) return new Response('Unauthorized', { status: 401 })
  return new Response('Method Not Allowed: this endpoint has no server-initiated stream', {
    status: 405,
  })
}
