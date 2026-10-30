import { describe, expect, it } from 'vitest'
import { getDictionary } from './index'
import zh from './dictionaries/zh'
import en from './dictionaries/en'

describe('i18n', () => {
  it('zh and en have identical key sets', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort())
  })

  it('uses sentence case without filler', () => {
    for (const value of Object.values(zh)) {
      expect(value).not.toMatch(/[，。]$/)
    }
  })

  it('returns the requested dictionary', () => {
    expect(getDictionary('zh').siteName).toBe(zh.siteName)
    expect(getDictionary('en').siteName).toBe(en.siteName)
  })

  it('has no empty values', () => {
    for (const [key, value] of Object.entries(zh)) {
      expect(value, key).not.toBe('')
    }
  })
})
