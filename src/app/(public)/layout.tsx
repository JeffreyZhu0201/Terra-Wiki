import type { ReactNode } from 'react'
import { CodeCopyEnabler } from '@/components/article/CodeCopyEnabler'
import { CategoryTree } from '@/components/layout/CategoryTree'
import { TopBar } from '@/components/layout/TopBar'
import { listCategoryTree } from '@/server/services/categories'

export const dynamic = 'force-dynamic'

export default async function PublicLayout({ children }: { children: ReactNode }) {
  const tree = await listCategoryTree()

  return (
    <div className="min-h-screen bg-paper text-ink">
      <TopBar tree={tree} />

      <div className="mx-auto flex w-full max-w-[1440px] gap-10 px-5">
        <aside className="hidden w-60 shrink-0 py-8 lg:block">
          <CategoryTree nodes={tree} />
        </aside>
        <main id="content" className="min-w-0 flex-1 py-8">
          {children}
        </main>
      </div>

      <CodeCopyEnabler />
    </div>
  )
}
