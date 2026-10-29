/**
 * 语言相关的常量与类型。客户端组件也要用它们，
 * 所以这里不放任何服务端专有的依赖（cookies / headers）。
 */
export type Locale = 'zh' | 'en'

export const LOCALE_COOKIE = 'terrawiki_locale'
