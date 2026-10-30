'use client'

import { useEffect } from 'react'

/**
 * 给服务端渲染出来的代码窗格接上复制按钮。
 * 正文是整段 HTML 注入的，里面的按钮不会自动获得 React 的事件，
 * 所以在这里用事件委托统一处理。
 */
export function CodeCopyEnabler() {
  useEffect(() => {
    async function onClick(event: MouseEvent) {
      const target = event.target as HTMLElement | null
      const button = target?.closest<HTMLElement>('[data-code-copy]')
      if (!button) return

      const code = button.dataset.code ?? ''
      try {
        await navigator.clipboard.writeText(code)
        button.textContent = '已复制'
        window.setTimeout(() => {
          button.textContent = '复制'
        }, 2000)
      } catch {
        button.textContent = '复制失败'
      }
    }

    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])

  return null
}
