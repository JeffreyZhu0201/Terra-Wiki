import { listPosts, PUBLIC_ACTOR } from '@/server/services/posts'

export const dynamic = 'force-dynamic'

const SITE_URL = process.env.SITE_URL ?? 'http://localhost:3000'

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export async function GET(): Promise<Response> {
  const { items } = await listPosts({ actor: PUBLIC_ACTOR, limit: 50 })

  const entries = items
    .map((post) => {
      const url = `${SITE_URL}/${post.categoryPath}/${post.slug}`
      const published = (post.publishedAt ?? post.updatedAt).toUTCString()
      return [
        '    <item>',
        `      <title>${escapeXml(post.title)}</title>`,
        `      <link>${escapeXml(url)}</link>`,
        `      <guid isPermaLink="true">${escapeXml(url)}</guid>`,
        `      <pubDate>${published}</pubDate>`,
        post.summary ? `      <description>${escapeXml(post.summary)}</description>` : '',
        '    </item>',
      ]
        .filter(Boolean)
        .join('\n')
    })
    .join('\n')

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0">',
    '  <channel>',
    '    <title>Terra-Wiki</title>',
    `    <link>${SITE_URL}</link>`,
    '    <description>面向程序员的技术文档站</description>',
    entries,
    '  </channel>',
    '</rss>',
  ].join('\n')

  return new Response(xml, {
    headers: { 'content-type': 'application/rss+xml; charset=utf-8' },
  })
}
