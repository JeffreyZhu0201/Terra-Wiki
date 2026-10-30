import type { Element } from 'hast'
import type { Code } from 'mdast'
import rehypeSlug from 'rehype-slug'
import rehypeStringify from 'rehype-stringify'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { unified } from 'unified'
import { ensureHighlighter, highlightToHast } from './shiki'
import { extractToc, type TocEntry } from './toc'

export type { TocEntry }

/**
 * 把 Markdown 渲染成 HTML 字符串。
 *
 * 走的是 unified 管线（mdast → hast → HTML），不经过 React 渲染：
 *   · 原始 HTML 不解析——remark-rehype 默认丢弃 html 节点，
 *     所以 Markdown 里写 <script> 只会消失，不会变成可执行脚本。
 *   · 代码高亮直接产出 hast，与正文在同一条管线上，没有二次拼接。
 */
export async function renderMarkdown(md: string): Promise<{ html: string; toc: TocEntry[] }> {
  await ensureHighlighter()

  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype, {
      handlers: {
        code(_state: unknown, node: Code): Element {
          const lang = node.lang ?? ''
          const meta = node.meta ?? ''
          // 左侧只显示文件名（title="..."），没有就留空；
          // 语言标签与复制按钮固定在右侧。
          const title = /title="([^"]*)"/.exec(meta)?.[1] ?? ''
          const code = node.value.replace(/\n$/, '')

          const highlighted = highlightToHast(code, lang)
          if (!highlighted) {
            return {
              type: 'element',
              tagName: 'pre',
              properties: { className: ['code-block'] },
              children: [
                {
                  type: 'element',
                  tagName: 'code',
                  properties: {},
                  children: [{ type: 'text', value: code }],
                },
              ],
            }
          }

          return {
            type: 'element',
            tagName: 'div',
            properties: { className: ['code-pane'] },
            children: [
              {
                type: 'element',
                tagName: 'div',
                properties: { className: ['code-pane-bar'] },
                children: [
                  {
                    type: 'element',
                    tagName: 'span',
                    properties: { className: ['code-pane-title'] },
                    children: [{ type: 'text', value: title }],
                  },
                  ...(lang
                    ? ([
                        {
                          type: 'element',
                          tagName: 'span',
                          properties: { className: ['code-pane-lang'] },
                          children: [{ type: 'text', value: lang }],
                        },
                      ] as Element[])
                    : []),
                  {
                    type: 'element',
                    tagName: 'button',
                    properties: {
                      type: 'button',
                      className: ['code-pane-copy'],
                      'data-code-copy': '',
                      'data-code': code,
                    },
                    children: [{ type: 'text', value: '复制' }],
                  },
                ],
              },
              {
                type: 'element',
                tagName: 'div',
                properties: { className: ['code-pane-body'] },
                children: highlighted.children.filter(
                  (child): child is Element => child.type === 'element',
                ),
              },
            ],
          }
        },
      },
    })
    .use(rehypeSlug)
    .use(rehypeStringify)
    .process(md)

  const html = String(file)
  return { html, toc: extractToc(html) }
}
