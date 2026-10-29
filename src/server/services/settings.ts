import { eq } from 'drizzle-orm'
import { db } from '../db/client'
import { siteSettings } from '../db/schema'

export const SETTING_KEYS = ['siteName', 'siteDescription', 'siteUrl', 'rssTitle'] as const
export type SettingKey = (typeof SETTING_KEYS)[number]
export type Settings = Record<SettingKey, string>

const DEFAULTS: Settings = {
  siteName: 'Terra-Wiki',
  siteDescription: '面向程序员的技术文档站',
  siteUrl: 'http://localhost:3000',
  rssTitle: 'Terra-Wiki',
}

/** 站点设置。缺省值兜底，所以页面永远有值可显示。 */
export async function getSettings(): Promise<Settings> {
  const rows = await db.select().from(siteSettings)
  const stored = new Map(rows.map((row) => [row.key, row.value]))

  const result = { ...DEFAULTS }
  for (const key of SETTING_KEYS) {
    const value = stored.get(key)
    if (typeof value === 'string') result[key] = value
  }
  return result
}

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
