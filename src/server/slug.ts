import { pinyin } from 'pinyin'

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/
const MAX_SLUG_LENGTH = 80

/** slug 合法性：ASCII kebab-case，1–80 字符。 */
export function isValidSlug(slug: string): boolean {
  return slug.length > 0 && slug.length <= MAX_SLUG_LENGTH && SLUG_PATTERN.test(slug)
}

/**
 * 标题转 slug。中文走拼音转写——内容主要是中文，
 * 拼音比让作者手写英文 slug 更实际。
 */
export function slugify(input: string): string {
  const normalized = input.normalize('NFKC').toLowerCase()
  const hasCjk = /[\u3400-\u9fff\uf900-\ufaff]/.test(normalized)
  const ascii = hasCjk
    ? pinyin(normalized, { style: 'normal' })
        .map((syllables) => syllables[0] ?? '')
        .join('')
    : normalized

  return ascii
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, '')
}

/** 自动生成 slug 撞车时加后缀，而不是覆盖别人的 URL。 */
export function ensureUniqueSlug(base: string, isTaken: (slug: string) => boolean): string {
  const clean = base || 'post'
  if (!isTaken(clean)) return clean

  for (let n = 2; n < 100; n += 1) {
    const suffix = `-${n}`
    const candidate = `${clean.slice(0, MAX_SLUG_LENGTH - suffix.length)}${suffix}`
    if (!isTaken(candidate)) return candidate
  }

  const fallback = `-${Date.now().toString(36)}`
  return `${clean.slice(0, MAX_SLUG_LENGTH - fallback.length)}${fallback}`
}
