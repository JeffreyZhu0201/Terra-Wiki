import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import './globals.css'

export const metadata: Metadata = {
  title: 'Terra-Wiki',
  description: '面向程序员的技术文档站',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh">
      <body className="bg-paper text-ink">{children}</body>
    </html>
  )
}
