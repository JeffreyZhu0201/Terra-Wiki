import type { Metadata } from 'next'
import { ThemeProvider } from 'next-themes'
import type { ReactNode } from 'react'
import { getLocale } from '@/i18n'
import './globals.css'

export const metadata: Metadata = {
  title: 'Terra-Wiki',
  description: '面向程序员的技术文档站',
}

/**
 * 字体走浏览器运行时加载，不用 next/font/google。
 * next/font 会在构建时去 Google 拉字体文件——离线或受限网络里，
 * `docker compose build` 会直接失败。改成 <link> 之后，
 * 构建不需要联网，取不到字体时回落到系统里的中文衬线/黑体。
 */
const FONT_HREF =
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700' +
  '&family=JetBrains+Mono:wght@400;500;700' +
  '&family=Noto+Serif+SC:wght@400;600;700&display=swap'

// 界面语言来自 cookie / Accept-Language，根布局必须动态渲染。
export const dynamic = 'force-dynamic'

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale()

  return (
    <html lang={locale}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href={FONT_HREF} />
      </head>
      <body className="bg-paper font-sans text-ink antialiased">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
