export type TocEntry = {
  id: string
  text: string
  depth: 2 | 3
}

const HEADING_RE = /<h([23])\s+id="([^"]+)"[^>]*>([\s\S]*?)<\/h\1>/g

function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
}

/** 从渲染好的 HTML 里抽出 h2 / h3，作为文章右侧的目录。 */
export function extractToc(html: string): TocEntry[] {
  const entries: TocEntry[] = []
  const re = new RegExp(HEADING_RE.source, 'g')

  let match: RegExpExecArray | null
  while ((match = re.exec(html)) !== null) {
    const depth = Number(match[1]) === 3 ? 3 : 2
    const id = match[2] ?? ''
    const text = decodeEntities((match[3] ?? '').replace(/<[^>]*>/g, '')).trim()
    if (!id || !text) continue
    entries.push({ id, text, depth })
  }

  return entries
}
