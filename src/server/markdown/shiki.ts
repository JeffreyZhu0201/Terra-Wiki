import { createHighlighter, type Highlighter } from 'shiki'

const LANGS = [
  'ts',
  'tsx',
  'js',
  'jsx',
  'json',
  'bash',
  'shell',
  'sql',
  'yaml',
  'md',
  'python',
  'go',
  'rust',
  'diff',
  'html',
  'css',
]

const LIGHT_THEME = 'github-light'
const DARK_THEME = 'vitesse-dark'

export type HasiRoot = ReturnType<Highlighter['codeToHast']>

let highlighterPromise: Promise<Highlighter> | null = null
let loaded: Highlighter | null = null

export function getHighlighter(): Promise<Highlighter> {
  highlighterPromise ??= createHighlighter({
    themes: [LIGHT_THEME, DARK_THEME],
    langs: LANGS,
  })
  return highlighterPromise
}

/** 确保高亮器已就绪。渲染前必须先调一次。 */
export async function ensureHighlighter(): Promise<void> {
  loaded = await getHighlighter()
}

/**
 * 高亮成 hast。输出同时带亮色与暗色的 CSS 变量
 * （--shiki-light / --shiki-dark），由 CSS 决定用哪一套。
 * 语言不支持时返回 null，调用方退回纯文本。
 */
export function highlightToHast(code: string, lang: string): HasiRoot | null {
  if (!loaded) return null

  const normalized = lang.toLowerCase()
  if (!normalized || normalized === 'text' || normalized === 'plaintext') return null
  if (!loaded.getLoadedLanguages().includes(normalized)) return null

  return loaded.codeToHast(code, {
    lang: normalized,
    themes: { light: LIGHT_THEME, dark: DARK_THEME },
    defaultColor: false,
  })
}
