import type { Actor } from '@/server/services/posts'

/**
 * 一次 MCP 调用的身份。actor 是 Token 归属的作者——
 * 工具的权限完全继承这个作者在后台的权限，再叠加 token 自身的 can_publish。
 */
export type McpContext = {
  actor: Actor
  tokenId: string
}
