import { describe, expect, it } from 'vitest'
import { renderMarkdown } from './render'

describe('markdown', () => {
  it('renders a code fence with a file-path header', async () => {
    const { html } = await renderMarkdown('```ts title="src/app/api/mcp/route.ts"\nconst a = 1\n```')
    expect(html).toContain('src/app/api/mcp/route.ts')
    expect(html).toContain('code-pane')
  })

  it('does not parse raw html', async () => {
    const { html } = await renderMarkdown('<script>alert(1)</script>')
    expect(html).not.toContain('<script>')
  })

  it('builds a table of contents from h2 and h3', async () => {
    const { toc } = await renderMarkdown('## 准备\n\n### 安装\n\n## 配置\n')
    expect(toc.map((t) => t.depth)).toEqual([2, 3, 2])
    expect(toc[0]?.text).toBe('准备')
  })

  it('highlights for both light and dark themes', async () => {
    const { html } = await renderMarkdown('```ts\nconst a = 1\n```')
    expect(html).toContain('--shiki-light')
    expect(html).toContain('--shiki-dark')
  })

  it('gives headings an anchor id', async () => {
    const { html } = await renderMarkdown('## 准备\n')
    expect(html).toContain('id="准备"')
  })

  it('leaves inline code alone', async () => {
    const { html } = await renderMarkdown('这是 `inline` 代码')
    expect(html).not.toContain('code-pane')
    expect(html).toContain('<code')
  })

  it('falls back to plain text for an unknown language', async () => {
    const { html } = await renderMarkdown('```notalang\nfoo\n```')
    expect(html).not.toContain('code-pane')
    expect(html).toContain('foo')
    // 回退的代码块要带上 code-block 类——CSS 靠它给深色底与浅色文字。
    expect(html).toContain('code-block')
  })

  it('does not repeat the language label when the title equals it', async () => {
    const { html } = await renderMarkdown('```ts title="ts"\nconst a = 1\n```')
    expect(html).not.toContain('code-pane-lang')
  })

  it('shows the language label when the title differs', async () => {
    const { html } = await renderMarkdown('```ts title="src/app.ts"\nconst a = 1\n```')
    expect(html).toContain('code-pane-lang')
    expect(html).toContain('src/app.ts')
  })
})
