import { MarkdownEditor } from '@/components/admin/MarkdownEditor'
import { getDictionary, getLocale } from '@/i18n'
import { listCategoryTree } from '@/server/services/categories'
import { listTags } from '@/server/services/tags'

export const dynamic = 'force-dynamic'

export default async function NewPostPage() {
  const dict = getDictionary(await getLocale())
  const [tree, tags] = await Promise.all([listCategoryTree(), listTags()])

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

  return (
    <div className="space-y-6">
      <h1 className="font-serif text-2xl text-ink">{dict.adminNewPost}</h1>

      <MarkdownEditor
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
        }}
      />
    </div>
  )
}
