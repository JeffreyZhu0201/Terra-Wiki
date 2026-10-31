import type { ReactNode } from 'react'
import { CodeCopyEnabler } from '@/components/article/CodeCopyEnabler'
import { CategoryTree } from '@/components/layout/CategoryTree'
import { TopBar } from '@/components/layout/TopBar'
import { listCategoryTree } from '@/server/services/categories'
import { getSettings } from '@/server/services/settings'

export const dynamic = 'force-dynamic'

export default async function PublicLayout({ children }: { children: ReactNode }) {
  const [tree, settings] = await Promise.all([listCategoryTree(), getSettings()])

  return (
    /*
     * 外壳固定为一屏高，整页不滚动——滚动交给下面两栏各自处理：
     *   · 左栏自己的 overflow-y-auto：分类树过长时，鼠标在栏内才滚它
     *   · 中间 main 的 overflow-y-auto：正文在这里滚
     * 之前用 sticky 无效，是因为 body 在滚、侧栏的包含块高度又恰好等于自身，
     * sticky 没有被允许移动的余量。
     */
    <div className="flex h-screen flex-col overflow-hidden bg-paper text-ink">
      <TopBar tree={tree} />

      <div className="mx-auto flex w-full min-h-0 max-w-[1440px] flex-1 gap-10 px-5">
        <aside className="rail-scroll hidden w-60 shrink-0 overflow-y-auto py-8 lg:block">
          <CategoryTree nodes={tree} />
        </aside>

        {/* rail-scroll：隐藏 main 贴窗口右缘的滚动条，避免被误认成右侧栏的。 */}
        <main id="content" className="rail-scroll min-w-0 flex-1 overflow-y-auto">
          <div className="py-8">{children}</div>
        </main>
      </div>

      {settings.siteFooter ? (
        /*
         * 页脚挂在 shell 底部、与三栏无关：
         * 放进 main 里只会相对正文列居中，左栏一占位，文字就偏离页面中线；
         * 独立成一行才横跨整个窗口，text-center 是真正的居中，且贴住底边。
         */
        <footer className="shrink-0 px-5 pb-3 pt-1 text-center font-mono text-xs text-ink-muted">
          {settings.siteFooter}
        </footer>
      ) : null}

      <CodeCopyEnabler />
    </div>
  )
}
