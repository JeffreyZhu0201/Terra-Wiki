/**
 * 业务层统一错误。service 层只抛这个类型——Server Actions 与 MCP 工具
 * 需要把同一个错误映射成同一段文案给用户看。
 */
export class DomainError extends Error {
  constructor(
    public readonly code: 'not_found' | 'conflict' | 'forbidden' | 'invalid' | 'unauthorized',
    message: string,
    public readonly details?: Record<string, unknown> | undefined,
  ) {
    super(message)
    this.name = 'DomainError'
  }
}
