import { describe, expect, it } from 'vitest'

describe('test harness', () => {
  it('points at the test database', () => {
    expect(process.env.TEST_DATABASE_URL).toContain('terra_test')
  })

  it('resolves the @ path alias', async () => {
    const { cn } = await import('@/lib/utils')
    expect(cn('px-2', 'py-1')).toBe('px-2 py-1')
  })

  it('drops falsy class values', async () => {
    const { cn } = await import('@/lib/utils')
    expect(cn('px-2', false && 'hidden', undefined)).toBe('px-2')
  })
})
