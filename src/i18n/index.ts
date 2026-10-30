import { cookies, headers } from 'next/headers'
import en from './dictionaries/en'
import zh from './dictionaries/zh'
import { LOCALE_COOKIE, type Locale } from './locale'

export type { Locale }
export { LOCALE_COOKIE }

export type Dictionary = typeof zh

const DICTIONARIES: Record<Locale, Dictionary> = { zh, en }

/**
 * 当前界面语言。cookie 优先，其次 Accept-Language，最后默认中文。
 * cookies() 与 headers() 都是异步的，所以这个函数是异步的。
 *
 * 这个模块只能在服务端用——客户端组件请从 ./locale 取常量和类型。
 */
export async function getLocale(): Promise<Locale> {
  const store = await cookies()
  const fromCookie = store.get(LOCALE_COOKIE)?.value
  if (fromCookie === 'zh' || fromCookie === 'en') return fromCookie

  const headerList = await headers()
  const accepted = headerList.get('accept-language') ?? ''
  return accepted.toLowerCase().includes('en') ? 'en' : 'zh'
}

export function getDictionary(locale: Locale): Dictionary {
  return DICTIONARIES[locale]
}

export function t(locale: Locale, key: keyof Dictionary): string {
  return DICTIONARIES[locale][key]
}
