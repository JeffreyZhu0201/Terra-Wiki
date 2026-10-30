import { cache } from 'react'
import { eq } from 'drizzle-orm'
import { db } from '../db/client'
import { siteSettings } from '../db/schema'

export const SETTING_KEYS = [
  'siteName',
  'siteDescription',
  'siteUrl',
  'rssTitle',
  'siteKeywords',
  'siteFooter',
] as const
export type SettingKey = (typeof SETTING_KEYS)[number]
export type Settings = Record<SettingKey, string>

/**
 * 初始值来自 env，DB 里的值覆盖它。
 *
 * env 是「装好即用」的出厂配置，DB 是运行期改出来的——
 * 改了 DB 不动 env，重启不丢；改了 env 只在 DB 里还没有该项时生效。
 */
const ENV_DEFAULTS: Record<SettingKey, string | undefined> = {
  siteName: process.env.SITE_NAME,
  siteDescription: process.env.SITE_DESCRIPTION,
  siteUrl: process.env.SITE_URL,
  rssTitle: process.env.RSS_TITLE,
  siteKeywords: process.env.SITE_KEYWORDS,
  siteFooter: process.env.SITE_FOOTER,
}

/** env 也没给时的兜底——页面永远有值可显示。 */
const FALLBACKS: Settings = {
  siteName: 'Terra-Wiki',
  siteDescription: '面向程序员的技术文档站',
  siteUrl: 'http://localhost:3000',
  rssTitle: 'Terra-Wiki',
  siteKeywords: '',
  siteFooter: '',
}

/** 哪些设置项已经在 DB 里了——后台要据此显示「来自 DB 还是 env」。 */
export async function listStoredSettingKeys(): Promise<Set<SettingKey>> {
  const rows = await db.select({ key: siteSettings.key }).from(siteSettings)
  return new Set(rows.map((row) => row.key as SettingKey))
}

/**
 * 读设置。同一次请求内只查一次库（React cache 按请求去重），
 * 跨请求不缓存——后台改完设置，下个请求就是新值。
 *
 * 不用模块级变量做缓存：Next 的 server action 与页面渲染可能不在
 * 同一个进程，模块级缓存会读到过期值（改完不生效）。
 */
export const getSettings = cache(async (): Promise<Settings> => {
  const rows = await db.select().from(siteSettings)
  const stored = new Map(rows.map((row) => [row.key, row.value]))

  const result = { ...FALLBACKS }
  for (const key of SETTING_KEYS) {
    const fromDb = stored.get(key)
    if (typeof fromDb === 'string' && fromDb !== '') {
      result[key] = fromDb
      continue
    }
    const fromEnv = ENV_DEFAULTS[key]
    if (fromEnv !== undefined && fromEnv !== '') result[key] = fromEnv
  }

  return result
})

export async function updateSettings(values: Partial<Settings>): Promise<Settings> {
  for (const [key, value] of Object.entries(values)) {
    if (!SETTING_KEYS.includes(key as SettingKey)) continue
    if (typeof value !== 'string') continue

    await db
      .insert(siteSettings)
      .values({ key: key as SettingKey, value })
      .onConflictDoUpdate({ target: siteSettings.key, set: { value } })
  }

  return getSettings()
}

/** 清掉某个设置项，回到 env 的初始值。 */
export async function resetSetting(key: SettingKey): Promise<Settings> {
  await db.delete(siteSettings).where(eq(siteSettings.key, key))
  return getSettings()
}
