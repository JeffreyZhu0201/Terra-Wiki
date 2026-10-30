import { beforeEach, describe, expect, it } from 'vitest'
import { resetDb } from '../../../tests/db'
import { getSettings, resetSetting, updateSettings } from './settings'

describe('settings', () => {
  beforeEach(async () => {
    await resetDb()
  })

  it('falls back to the built-in defaults when nothing is stored', async () => {
    const settings = await getSettings()
    expect(settings.siteName).toBe('Terra-Wiki')
    expect(settings.siteUrl).toBeTruthy()
  })

  it('stores values in the database and reads them back', async () => {
    await updateSettings({ siteName: '我的技术站', siteUrl: 'https://example.com' })
    const settings = await getSettings()
    expect(settings.siteName).toBe('我的技术站')
    expect(settings.siteUrl).toBe('https://example.com')
  })

  it('drops a value back to the initial one on reset', async () => {
    await updateSettings({ siteName: '改过的名字' })
    expect((await getSettings()).siteName).toBe('改过的名字')

    await resetSetting('siteName')
    expect((await getSettings()).siteName).toBe('Terra-Wiki')
  })

  it('ignores unknown keys', async () => {
    await updateSettings({ nope: 'x' } as never)
    expect((await getSettings()).siteName).toBe('Terra-Wiki')
  })
})
