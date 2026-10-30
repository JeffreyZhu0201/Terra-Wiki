import { describe, expect, it } from 'vitest'
import { ensureUniqueSlug, isValidSlug, slugify } from './slug'

describe('slug', () => {
  it('accepts kebab-case only', () => {
    expect(isValidSlug('nextjs-mcp')).toBe(true)
    expect(isValidSlug('Nextjs')).toBe(false)
    expect(isValidSlug('a'.repeat(81))).toBe(false)
    expect(isValidSlug('has/slash')).toBe(false)
  })

  it('transliterates chinese titles', () => {
    expect(slugify('用 MCP 装上发布能力')).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  })

  it('kebab-cases ascii titles', () => {
    expect(slugify('Hello MCP World')).toBe('hello-mcp-world')
  })

  it('disambiguates collisions', () => {
    const taken = new Set(['guide', 'guide-2'])
    expect(ensureUniqueSlug('guide', (s) => taken.has(s))).toBe('guide-3')
  })

  it('keeps the original slug when it is free', () => {
    expect(ensureUniqueSlug('guide', () => false)).toBe('guide')
  })
})
