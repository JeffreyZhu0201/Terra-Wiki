# MCP 工具扩充（delete_tag / get_post_views / get_publish_calendar）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** MCP 工具从 22 个扩到 25 个：补齐标签删除，新增浏览量与发布节奏两个只读统计工具。

**Architecture:** 全部复用 service 层已有实现（`deleteTag` / `getViewCount` / `countPostsByDay`），`src/mcp/tools.ts` 只做 zod 入参 + 包装 + 审计。测试走 `InMemoryTransport` 真 Client 调用（现模式）。

**Tech Stack:** Next.js 16 + Drizzle + PostgreSQL + `@modelcontextprotocol/sdk` + vitest。

**Spec:** `docs/superpowers/specs/2026-10-31-mcp-more-tools-design.md`

## Global Constraints

- 包管理器只用 pnpm；完成定义 = `pnpm typecheck` + `pnpm test` 全过（测试连 55432 测试库）。
- service 层只抛 `DomainError`；MCP 工具层不写 `throw new Error`，非 DomainError 由 `toToolError` 兜住。
- 写操作必须 `recordAudit`；读操作不写审计。
- 工具描述是给 Agent 的协议文案（同 `instructions.ts`），不进 i18n 词典。
- 日期处理用 `src/lib/calendar.ts` 的 `dayKey` / `parseDayKey`（本地时区）；跨天加减用 `new Date(y, m, d + n)` 构造，不用毫秒数累加（DST 安全）。

## Review Focus

- `postIds` 含重复 id：应去重后逐个查询，返回按传入顺序的去重结果——测试断言之（Task 2）。
- `from > to` 或超 366 天：报 `invalid` 的 DomainError 文案，不静默返回空数组——测试断言之（Task 3）。
- 非法日期字符串（如 `2026-13-99`）：`parseDayKey` 返回 null → `invalid`，不得算出 NaN——测试断言之（Task 3）。
- 不存在的 postId 查浏览量：返回 `views: 0` 而不是报错——测试断言之（Task 2）。
- 删不存在的标签：沿用 service 的 `not_found`「标签不存在」——测试断言之（Task 1）。

---

### Task 1: delete_tag 工具

**Files:**
- Modify: `src/mcp/tools.ts`（imports 区加 `deleteTag`；`merge_tags` 工具之后插入新工具）
- Test: `src/mcp/tools.test.ts`（两处：`exposes the content tool set` 的精确名单；新增用例）

**Interfaces:**
- Consumes: `deleteTag(id: string): Promise<void>`（`src/server/services/tags.ts`，不存在时抛 `not_found`「标签不存在」）；`recordAudit({ actor, action, target })`。
- Produces: MCP 工具 `delete_tag`，入参 `{ tagId: string }`，成功返回 `{ ok: true }`。

- [ ] **Step 1: 更新工具名单测试并写失败用例**

`exposes the content tool set but no platform management tools` 的期望数组在 `delete_media` 后插入 `'delete_tag',`（保持字母序，共 23 个）。新增用例：

```ts
it('deletes a tag and records the audit', async () => {
  const { ctx } = await tokenContext({ canPublish: false })
  const client = await connect(ctx)
  const { createTag } = await import('../server/services/tags')
  const tag = await createTag('待删标签')

  const ok = await client.callTool({ name: 'delete_tag', arguments: { tagId: tag.id } })
  expect(ok.isError).toBeFalsy()

  const { listTags } = await import('../server/services/tags')
  expect((await listTags()).map((t) => t.name)).not.toContain('待删标签')
  const entry = (await db.select().from(auditLogs)).find((l) => l.action === 'tag.delete')
  expect(entry?.actorType).toBe('token')

  const missing = await client.callTool({ name: 'delete_tag', arguments: { tagId: '00000000-0000-0000-0000-000000000000' } })
  expect(missing.isError).toBe(true)
  expect((missing.content as { type: 'text'; text: string }[])[0]!.text).toContain('标签不存在')
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run src/mcp/tools.test.ts`
Expected: FAIL（名单不含 `delete_tag` / 新用例报未知工具）

- [ ] **Step 3: 实现工具**

imports 的 tags 一行扩成 `import { createTag, deleteTag, listTags, mergeTags, renameTag } from '@/server/services/tags'`。在 `merge_tags` 注册块之后加：

```ts
server.registerTool(
  'delete_tag',
  {
    description: '删除标签，文章关联一并移除。',
    inputSchema: z.object({ tagId: z.string() }),
  },
  async ({ tagId }) =>
    run(async () => {
      await deleteTag(tagId)
      await recordAudit({ actor, action: 'tag.delete', target: { type: 'tag', id: tagId } })
      return { ok: true }
    }),
)
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm vitest run src/mcp/tools.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/mcp/tools.ts src/mcp/tools.test.ts
git commit -m "feat(mcp): add delete_tag tool"
```

---

### Task 2: get_post_views 工具

**Files:**
- Modify: `src/mcp/tools.ts`（imports 加 `getViewCount`；`list_revisions` 之后插入）
- Test: `src/mcp/tools.test.ts`

**Interfaces:**
- Consumes: `getViewCount(postId: string): Promise<number>`（`src/server/services/views.ts`）；`postViewDaily` 表（`{ postId, day, views }`，测试直接插行）。
- Produces: MCP 工具 `get_post_views`，入参 `{ postIds: string[] }`（1–50），返回 `[{ postId, views }]`，顺序同传入、id 去重。

- [ ] **Step 1: 更新工具名单并写失败用例**

测试文件 imports：schema 一行扩成 `import { auditLogs, mcpTokens, postViewDaily } from '../server/db/schema'`。名单测试在 `get_post` 后插入 `'get_post_views',`（共 24 个）。新增用例：

```ts
it('returns cumulative view counts with unknown ids as zero', async () => {
  const category = await createCategory({ parentId: null, slug: 'guide', name: '指南' })
  const { ctx } = await tokenContext({ canPublish: false })
  const client = await connect(ctx)
  const created = await client.callTool({
    name: 'create_post',
    arguments: { categoryId: category.id, title: 'T', bodyMd: 'B' },
  })
  const postId = JSON.parse((created.content as { type: 'text'; text: string }[])[0]!.text).id as string

  await db.insert(postViewDaily).values([
    { postId, day: '2026-10-30', views: 3 },
    { postId, day: '2026-10-31', views: 5 },
  ])

  const result = await client.callTool({
    name: 'get_post_views',
    arguments: { postIds: [postId, '00000000-0000-0000-0000-000000000000', postId] },
  })
  expect(result.isError).toBeFalsy()
  const items = JSON.parse((result.content as { type: 'text'; text: string }[])[0]!.text) as {
    postId: string
    views: number
  }[]
  // 重复 id 去重；不存在的 id 返回 0 而不是报错
  expect(items).toEqual([
    { postId, views: 8 },
    { postId: '00000000-0000-0000-0000-000000000000', views: 0 },
  ])

  const tooMany = await client.callTool({
    name: 'get_post_views',
    arguments: { postIds: Array.from({ length: 51 }, () => postId) },
  })
  expect(tooMany.isError).toBe(true)
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run src/mcp/tools.test.ts`
Expected: FAIL（名单缺 `get_post_views`）

- [ ] **Step 3: 实现工具**

imports 加 `import { getViewCount } from '@/server/services/views'`。在 `list_revisions` 注册块之后（`// ---------- 写 ----------` 之前）加：

```ts
server.registerTool(
  'get_post_views',
  {
    description: '批量查询文章的累计浏览次数。不存在的文章 id 返回 0。',
    inputSchema: z.object({
      postIds: z.array(z.string()).min(1).max(50),
    }),
  },
  async ({ postIds }) =>
    run(async () => {
      const unique = [...new Set(postIds)]
      const items: { postId: string; views: number }[] = []
      for (const postId of unique) {
        items.push({ postId, views: await getViewCount(postId) })
      }
      return items
    }),
)
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm vitest run src/mcp/tools.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/mcp/tools.ts src/mcp/tools.test.ts
git commit -m "feat(mcp): add get_post_views tool"
```

---

### Task 3: get_publish_calendar 工具

**Files:**
- Modify: `src/mcp/tools.ts`（imports 加 `countPostsByDay`、`dayKey`/`parseDayKey`；`get_post_views` 之后插入）
- Test: `src/mcp/tools.test.ts`

**Interfaces:**
- Consumes: `countPostsByDay(from: Date, toExclusive: Date): Promise<Map<string, number>>`（`src/server/services/posts.ts`，键为 `dayKey` 格式）；`dayKey(date): string`、`parseDayKey(key): Date | null`（`src/lib/calendar.ts`，本地时区）。
- Produces: MCP 工具 `get_publish_calendar`，入参 `{ from?: string, to?: string }`（`YYYY-MM-DD`，含端点），返回 `[{ day, count }]` 升序、零计数天也返回；默认最近 90 天；跨度上限 366 天。

- [ ] **Step 1: 更新工具名单并写失败用例**

测试文件 imports：drizzle 一行扩成 `import { eq, sql } from 'drizzle-orm'`。名单测试在 `get_post_views` 后插入 `'get_publish_calendar',`（共 25 个）。新增用例：

```ts
it('counts published posts per day and reports zero days', async () => {
  const category = await createCategory({ parentId: null, slug: 'guide', name: '指南' })
  const { ctx } = await tokenContext({ canPublish: true })
  const client = await connect(ctx)

  // 发布两篇，把 published_at 钉到已知日期；一篇留 draft 不计入
  const postIds: string[] = []
  for (const title of ['第一篇', '第二篇', '草稿']) {
    const created = await client.callTool({
      name: 'create_post',
      arguments: { categoryId: category.id, title, bodyMd: 'B' },
    })
    postIds.push(JSON.parse((created.content as { type: 'text'; text: string }[])[0]!.text).id as string)
  }
  await client.callTool({ name: 'publish_post', arguments: { postId: postIds[0]! } })
  await client.callTool({ name: 'publish_post', arguments: { postId: postIds[1]! } })
  await db.execute(sql`UPDATE posts SET published_at = ${'2026-10-01 10:00:00'}::timestamp WHERE id = ${postIds[0]!}`)
  await db.execute(sql`UPDATE posts SET published_at = ${'2026-10-03 10:00:00'}::timestamp WHERE id = ${postIds[1]!}`)

  const result = await client.callTool({
    name: 'get_publish_calendar',
    arguments: { from: '2026-10-01', to: '2026-10-04' },
  })
  expect(result.isError).toBeFalsy()
  const items = JSON.parse((result.content as { type: 'text'; text: string }[])[0]!.text) as {
    day: string
    count: number
  }[]
  expect(items).toEqual([
    { day: '2026-10-01', count: 1 },
    { day: '2026-10-02', count: 0 },
    { day: '2026-10-03', count: 1 },
    { day: '2026-10-04', count: 0 },
  ])

  const badRange = await client.callTool({
    name: 'get_publish_calendar',
    arguments: { from: '2026-10-04', to: '2026-10-01' },
  })
  expect(badRange.isError).toBe(true)

  const badDate = await client.callTool({
    name: 'get_publish_calendar',
    arguments: { from: 'not-a-date', to: '2026-10-01' },
  })
  expect(badDate.isError).toBe(true)

  const tooLong = await client.callTool({
    name: 'get_publish_calendar',
    arguments: { from: '2020-01-01', to: '2026-10-01' },
  })
  expect(tooLong.isError).toBe(true)
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run src/mcp/tools.test.ts`
Expected: FAIL（名单缺 `get_publish_calendar`）

- [ ] **Step 3: 实现工具**

imports：`src/server/services/posts` 一行加 `countPostsByDay`；`import { dayKey, parseDayKey } from '@/lib/calendar'`。在 `get_post_views` 注册块之后加。零填充用本地时区逐天推进（`new Date(y, m, d + n)` 构造，DST 安全）：

```ts
server.registerTool(
  'get_publish_calendar',
  {
    description:
      '按天统计已发布文章数（按 published_at，本地时区）。from / to 省略时默认最近 90 天；' +
      '跨度上限 366 天；count 为 0 的天也返回。',
    inputSchema: z.object({
      from: z.string().optional().describe('YYYY-MM-DD（含）'),
      to: z.string().optional().describe('YYYY-MM-DD（含）'),
    }),
  },
  async ({ from, to }) =>
    run(async () => {
      const toDay = to ? parseDayKey(to) : new Date()
      if (!toDay) throw new DomainError('invalid', 'to 不是合法的日期', { to })
      const toZero = new Date(toDay.getFullYear(), toDay.getMonth(), toDay.getDate())
      const fromDay = from ? parseDayKey(from) : new Date(toZero.getFullYear(), toZero.getMonth(), toZero.getDate() - 89)
      if (!fromDay) throw new DomainError('invalid', 'from 不是合法的日期', { from })
      const fromZero = new Date(fromDay.getFullYear(), fromDay.getMonth(), fromDay.getDate())

      const spanDays = Math.round((toZero.getTime() - fromZero.getTime()) / 86_400_000) + 1
      if (spanDays < 1) throw new DomainError('invalid', 'from 不能晚于 to', { from, to })
      if (spanDays > 366) throw new DomainError('invalid', '查询范围超过 366 天', { from, to })

      const counts = await countPostsByDay(fromZero, new Date(toZero.getFullYear(), toZero.getMonth(), toZero.getDate() + 1))
      const items: { day: string; count: number }[] = []
      for (let offset = 0; offset < spanDays; offset++) {
        const key = dayKey(new Date(fromZero.getFullYear(), fromZero.getMonth(), fromZero.getDate() + offset))
        items.push({ day: key, count: counts.get(key) ?? 0 })
      }
      return items
    }),
)
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm vitest run src/mcp/tools.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/mcp/tools.ts src/mcp/tools.test.ts
git commit -m "feat(mcp): add get_publish_calendar tool"
```

---

### Task 4: README 工具表同步 + 全量验证

**Files:**
- Modify: `README.md`（「🛠️ 工具集」一节）

**Interfaces:**
- Consumes: Task 1–3 完成后的 25 个工具。
- Produces: 与代码一致的文档。

- [ ] **Step 1: 改 README**

「共 **22 个**」改「共 **25 个**」。读表格加两行：

```markdown
| `get_post_views` | 批量查询文章累计浏览次数，不存在的 id 返回 0 |
| `get_publish_calendar` | 按天统计已发布文章数（默认最近 90 天，上限 366 天） |
```

「写——标签」表格加一行：

```markdown
| `delete_tag` | 删除标签，文章关联一并移除 |
```

- [ ] **Step 2: 全量验证**

Run: `pnpm typecheck && pnpm test`
Expected: 全过。

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs(mcp): document the three new tools"
```
