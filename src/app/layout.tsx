import type { Metadata } from 'next'
import { Inter, JetBrains_Mono, Noto_Serif_SC } from 'next/font/google'
import { ThemeProvider } from 'next-themes'
import type { ReactNode } from 'react'
import { getLocale } from '@/i18n'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' })

const jetbrains = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains', display: 'swap' })

// 中文字体没有 latin 子集可用，整包按 unicode-range 切片由浏览器按需下载。
const notoSerifSC = Noto_Serif_SC({
  weight: ['400', '600', '700'],
  variable: '--font-serif-sc',
  display: 'swap',
  preload: false,
})

export const metadata: Metadata = {
  title: 'Terra-Wiki',
  description: '面向程序员的技术文档站',
}

// 界面语言来自 cookie / Accept-Language，根布局必须动态渲染。
export const dynamic = 'force-dynamic'

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale()

  return (
    <html lang={locale} className={`${inter.variable} ${jetbrains.variable} ${notoSerifSC.variable}`}>
      <body className="bg-paper font-sans text-ink antialiased">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
