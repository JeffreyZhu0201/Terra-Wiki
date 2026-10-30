import { notFound } from 'next/navigation'
import { MarkdownEditor } from '@/components/admin/MarkdownEditor'
import { RevisionList } from '@/components/admin/RevisionList'
import { getDictionary, getLocale } from '@/i18n'
import { requireUser } from '@/server/auth/session'
import { listCategoryTree } from '@/server/services/categories'
import { getPostById, listPostTags } from '@/server/services/posts'
import { listRevisions } from '@/server/services/revisions'
import { listTags } from '@/server/services/tags'

export const dynamic = 'force-dynamic'

export default async function EditPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await requireUser()
  const dict = getDictionary(await getLocale())

  const post = await getPostById(id)
  if (!post) notFound()
  if (post.authorId !== user.id && user.role !== 'admin') notFound()

  const [tree, tags, revisions] = await Promise.all([
    listCategoryTree(),
    listTags(),
    listRevisions({ postId: post.id, actor: { kind: 'user', id: user.id, role: user.role } }),
  ])

  const leaves: { id: string; name: string; path: string }[] = []
  const walk = (nodes: typeof tree) => {
    for (const node of nodes) {
      if (node.children.length === 0) {
        leaves.push({ id: node.id, name: node.name, path: node.path })
      } else {
        walk(node.children)
      }
    }
  }
  walk(tree)

  const postTags = await listPostTags(post.id)

  return (
    <div className="space-y-10">
      <header className="flex items-center justify-between">
        <h1 className="font-serif text-2xl text-ink">{post.title}</h1>
        <span className="font-mono text-xs text-ink-muted">
          {post.status === 'published'
            ? dict.adminStatusPublished
            : post.status === 'archived'
              ? dict.adminStatusArchived
              : dict.adminStatusDraft}
        </span>
      </header>

      <MarkdownEditor
        post={{
          id: post.id,
          title: post.title,
          summary: post.summary,
          slug: post.slug,
          bodyMd: post.bodyMd,
          categoryId: post.categoryId,
          tags: postTags,
          status: post.status,
          updatedAt: post.updatedAt.toISOString(),
        }}
        categories={leaves}
        tags={tags.map((tag) => ({ slug: tag.slug, name: tag.name }))}
        labels={{
          title: dict.adminEditorTitle,
          summary: dict.adminEditorSummary,
          category: dict.adminEditorCategory,
          tags: dict.adminEditorTags,
          slug: dict.adminSlug,
          body: dict.adminEditorBody,
          preview: dict.adminEditorPreview,
          save: dict.adminSave,
          saving: dict.adminSaving,
          saved: dict.adminSaved,
          publish: dict.adminPublish,
          unpublish: dict.adminUnpublish,
          archive: dict.adminArchive,
          conflict: dict.adminConflict,
          reload: dict.adminReload,
          tagPlaceholder: dict.adminTagPlaceholder,
          tagRemove: dict.adminTagRemove,
        }}
      />

      <section>
        <h2 className="mb-3 font-mono text-xs uppercase tracking-wider text-ink-muted">
          {dict.adminRevisions}
        </h2>
        <RevisionList postId={post.id} revisions={revisions} />
      </section>
    </div>
  )
}
