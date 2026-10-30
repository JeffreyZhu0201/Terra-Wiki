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

/**
 * 「仅管理员可执行」的唯一一份文案。
 *
 * 后台界面与 MCP 通道都拿它填 DomainError.message——同一个错误，
 * 两边显示同一段话。界面侧的翻译在 src/i18n/dictionaries 里
 * （adminOnlyAdmin），但错误的本体只在这里定义一次。
 */
export const ADMIN_ONLY_MESSAGE = '仅管理员可执行此操作'
