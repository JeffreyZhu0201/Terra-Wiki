# Terra-Wiki Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个面向程序员、以 MCP 为第一公民的分类隔离技术博客：Agent 通过 MCP 写内容，人在 `/admin` 做策展，公开站点以 Wiki.js 式树形分类呈现。

**Architecture:** 单体 Next.js 16 App Router 应用。业务逻辑全部集中在 `src/server/services/*`，后台 Server Actions 与 MCP 工具调用同一套 service，保证两侧行为完全等价。数据库 Postgres 17 + Drizzle，正文存 `text`（Markdown）。前台用单一 catch-all 路由 + 固定解析顺序消歧分类页与文章页。MCP 以 Streamable HTTP 挂在 `/api/mcp`，与网站同进程同容器，附带 stdio 桥接脚本供本地 Claude Code 使用。

**Tech Stack:** Next.js 16.4.3 (App Router) · React 19.3.1 · TypeScript 5.x (strict) · Tailwind CSS v4.3.3 + shadcn/ui · PostgreSQL 17 · Drizzle ORM 0.45.4 + drizzle-kit · Zod 4.6.7 · Shiki 4.5.0 + react-markdown + remark-gfm · @modelcontextprotocol/sdk 1.32.2 · @node-rs/argon2 · vitest · pnpm 12 · Node 24 · Docker (node:24-slim)

**Spec:** `docs/superpowers/specs/2026-10-29-terra-wiki-design.md` — 计划从该规格推导，规格随计划一同阅读。

---

## Global Constraints

以下约束来自规格，**每个任务都隐含包含本节**。逐字取值，不得改写。

- **Node ≥ 24，pnpm 12**，包管理器固定用 pnpm（不用 npm / yarn）。
- **TypeScript**：`strict: true` + `noUncheckedIndexedAccess: true` + `exactOptionalPropertyTypes: true`；**禁止 `any`**（用 `unknown` + 类型守卫，或用泛型保留类型信息）。禁止为消除类型错误而放宽编译选项。
- **测试**：vitest，跑在 `docker-compose.test.yml` 的真实 Postgres 17 上。**禁止用 pg-mem**（`pg_trgm` 与 partial unique index 在 pg-mem 不可用）。
- **Docker 基础镜像固定 `node:24-slim`**（Debian），**不用 alpine**——`@node-rs/argon2` 是原生模块，musl 上预编译产物不可靠。
- **不建 REST API 层**：后台界面走 Server Actions，MCP 走工具，二者共享 `src/server/services/*`。
- **正文存 Postgres `text`**，不存文件系统。
- **Slug 规则**：统一 `^[a-z0-9]+(-[a-z0-9]+)*$`，长度 1–80，不含 `/`。文章 slug 在同一 `category_id` 内唯一；**文章 slug 与同级子分类 slug 互斥**。
- **保留字**（不可作为顶级分类 slug）：`all`、`tags`、`search`、`sitemap`、`login`、`admin`、`api`、`_next`、`uploads`、`rss.xml`、`sitemap.xml`、`favicon.ico`。
- **顶级分类 slug 全局唯一**（partial unique index on `slug` where `parent_id is null`）。
- **分类树用物化路径** `categories.path`（text，应用层维护），**不用 `ltree` 扩展**。
- **文章状态机**：`draft` → `published` → `archived`（可回 draft）。**无定时发布**。
- **状态变更只有三个入口**：`publish_post` / `unpublish_post` / `archive_post`。`create_post` / `update_post` **不接受 `status` 参数**。
- **MCP 权限 = 归属作者在后台的权限**（逐操作对齐），叠加 token 自身的 `can_publish`。唯一不对 MCP 开放的是**平台管理**：成员管理、Token 签发、站点设置、审计日志查询。
- **MCP 读可见范围 = 人类后台**：他人草稿只有 admin 可见。
- **新签发的 MCP Token 默认 `can_publish=false`**。
- **MCP 传输**：Streamable HTTP，端点 `POST /api/mcp`，`Authorization: Bearer <token>`，库里只存 `sha256(token)`。
- **路由解析顺序固定**：① 完整路径查 `categories.path` → 分类页；② 末段作 slug、其余作分类路径查文章 → 文章页；③ 查 `redirects.from_path` → 301；④ 否则 404。**只有一个 catch-all 路由文件**。
- **Markdown 不启用 `rehype-raw`**，不解析原始 HTML。
- **代码高亮**：Shiki 服务端渲染，双主题 `github-light` / `vitesse-dark`，CSS 变量切换，客户端不重渲染。
- **上传**：允许 `png` / `jpeg` / `webp` / `gif`，最大 10MB；**SVG 一律拒绝**；**文件名由服务端生成**，不使用用户提供的文件名。
- **浏览量**：`post_view_visitors` 做去重（`vid_hash = sha256(vid + SALT)`，不存原始 UUID），`post_view_daily` 存计数。
- **搜索**：Postgres `pg_trgm`，标题/摘要/正文各建一个 GIN trigram 索引；**接受 <3 字符查询走全表扫**，规模前提为文章数 < 5 万。
- **i18n**：仅 UI，zh / en，locale 存 cookie `terrawiki_locale`，**URL 不带 locale 前缀**。
- **暗色模式**：`next-themes`，`attribute="class"`，默认跟随系统。**暗色不是把亮色反过来**。
- **设计令牌（亮色）**：`paper #F4F5F6`、`surface #FFFFFF`、`ink #14171C`、`ink-muted #5A6472`、`rule #DDE1E6`、`accent #164A7B`、`accent-hover #123C63`、`accent-soft #EAF0F7`、`code-bg #10161D`、`code-ink #E6EDF3`、`danger #B42318`、`success #147D52`。
- **设计令牌（暗色）**：`paper #0F1318`、`surface #151A21`、`ink #E6EAF0`、`ink-muted #98A2B3`、`rule #232A33`、`accent #6BA8E0`、`accent-soft #16283A`、`code-bg #0A0E13`。
- **字体**：标题（中文）Noto Serif SC（next/font，按 unicode-range 切片）；正文（中文）系统栈 `-apple-system, "PingFang SC", "Microsoft YaHei"`（**不加载 Noto Sans SC**）；拉丁正文 Inter；代码与元信息 JetBrains Mono。
- **排版**：Body 16px / **行高 1.75**；正文列宽 **≤ 68 字符**；H1 32/1.25、H2 24/1.30、H3 19/1.40、Small 14/1.60、Micro 12.5/1.50。
- **列表分页 20 条/页**。**分类页聚合该分类整棵子树**。
- **每次写入都写审计日志**，actor 区分 `user` / `token`。
- **revision 只在内容字段（title / summary / body_md）变化时写**；状态流转只进审计日志；回滚只恢复这三个字段，tags / category / status 保持当前值。
- **删除即软删**：文章用 `archived`；分类只允许删空分类。
- **界面文案**：主动语态、句首大写、无填充词；中英两版都要写。
- **提交粒度**：每个任务结束时提交一次，commit message 用 Conventional Commits。

---

## Review Focus

以下五类是规格隐含、但任何单个任务的测试都不会自然覆盖的输入或失败模式——它们最可能在真实使用中咬人。每条都在下文指定的任务里有对应的测试步骤钉死。

1. **分类移动时深层子树的旧 URL 301 覆盖不全** —— 移动一棵 3 层子树，只重写直接子级会让孙级文章的旧链接 404。→ Task 4
2. **并发保存同一篇文章导致静默覆盖** —— 两个人（或人和 Agent）同时编辑，后保存的不能无声吃掉前一个的改动。→ Task 5
3. **Token 吊销后旧 token 仍可用** —— 签名/哈希对但已吊销的 token 必须被拒。→ Task 15
4. **上传只信文件扩展名** —— 一个内含脚本的 SVG 改名成 `.png` 会被放行。→ Task 6
5. **slug 冲突时静默覆盖已有文章** —— 自动生成的 slug 撞车必须报 409，不能悄悄改写别人的 URL。→ Task 5

---

## File Structure

```
src/
├─ app/
│  ├─ (public)/
│  │  ├─ page.tsx                    # 首页：最近更新 + 置顶 + 分类入口
│  │  ├─ [...segments]/page.tsx      # ★ 唯一 catch-all：分类页 / 文章页 / 标签过滤
│  │  ├─ tags/page.tsx
│  │  ├─ tags/[slug]/page.tsx
│  │  ├─ search/page.tsx
│  │  └─ sitemap/page.tsx
│  ├─ admin/
│  │  ├─ layout.tsx                  # 权限门 + 后台壳
│  │  ├─ page.tsx                    # 仪表盘
│  │  ├─ posts/page.tsx
│  │  ├─ posts/new/page.tsx
│  │  ├─ posts/[id]/page.tsx
│  │  ├─ categories/page.tsx
│  │  ├─ tags/page.tsx
│  │  ├─ media/page.tsx
│  │  ├─ team/page.tsx
│  │  ├─ tokens/page.tsx
│  │  ├─ audit/page.tsx
│  │  └─ settings/page.tsx
│  ├─ api/
│  │  ├─ mcp/route.ts                # MCP Streamable HTTP
│  │  ├─ track/route.ts
│  │  ├─ auth/login/route.ts
│  │  ├─ auth/logout/route.ts
│  │  └─ uploads/[...path]/route.ts
│  ├─ login/page.tsx
│  ├─ layout.tsx
│  ├─ globals.css
│  ├─ sitemap.ts
│  └─ robots.ts
├─ components/
│  ├─ ui/                            # shadcn 生成物
│  ├─ layout/{TopBar,CategoryTree,ThemeToggle,LocaleToggle}.tsx
│  ├─ article/{Markdown,CodePane,TableOfContents,MetaLine,ViewCounter}.tsx
│  └─ admin/{PostTable,MarkdownEditor,CategoryTreeEditor,MediaPicker,TokenList,RevisionList}.tsx
├─ server/
│  ├─ db/{schema.ts,client.ts}
│  ├─ services/{posts,categories,tags,media,revisions,views,auth}.ts
│  ├─ auth/{password.ts,session.ts}
│  ├─ storage/{index.ts,local-disk.ts}
│  ├─ markdown/{render.tsx,shiki.ts,toc.ts}
│  ├─ routes/resolve.ts
│  ├─ slug.ts
│  ├─ errors.ts
│  └─ audit.ts
├─ mcp/{server.ts,tools.ts,context.ts}
├─ i18n/{index.ts,dictionaries/{zh,en}.ts}
└─ lib/utils.ts
mcp/stdio-bridge.mjs
drizzle/                            # 迁移产物
tests/{setup.ts,db.ts}
Dockerfile · docker-compose.yml · docker-compose.test.yml · .env.example
```

**文件职责约定**：一个文件一件事。`services/*` 是唯一的业务逻辑所在；`app/**` 只做参数解析与调用；`mcp/tools.ts` 只做 Zod 解析 + 转发；`components/**` 只做渲染。

---

# Phase 1 — 地基与核心服务

### Task 1: 项目脚手架与测试基座

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `vitest.config.ts`, `docker-compose.test.yml`, `.env.example`, `src/lib/utils.ts`, `src/app/layout.tsx`
- Create: `tests/setup.ts`, `tests/db.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: 无（首个任务）
- Produces:
  - `tests/db.ts` 导出 `resetDb(): Promise<void>` — 清空所有业务表（含 TRUNCATE ... RESTART IDENTITY CASCADE）并插入固定的测试 admin（`admin@example.com` / 密码 `correct-horse-battery`，哈希为写死的 argon2id 常量）
  - `tests/setup.ts` 作为 vitest `setupFiles`，在每个测试文件前执行一次迁移
  - 环境变量名：`DATABASE_URL`（开发库）、`TEST_DATABASE_URL`（测试库）、`SESSION_SECRET`、`UPLOAD_DIR`、`SITE_URL`、`BOOTSTRAP_ADMIN_EMAIL`、`BOOTSTRAP_ADMIN_PASSWORD`、`VID_SALT`、`MCP_TOKEN_SALT`

- [ ] **Step 1: 写失败测试 —— 测试基座自检**

`tests/db.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { resetDb } from './db'
import { db } from '../src/server/db/client'
import { users } from '../src/server/db/schema'

describe('test harness', () => {
  it('resetDb truncates and reseeds', async () => {
    await resetDb()
    const rows = await db.select().from(users)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.role).toBe('admin')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `docker compose -f docker-compose.test.yml up -d && pnpm vitest run tests/db.test.ts`
Expected: FAIL —— `Cannot find module '../src/server/db/client'`

- [ ] **Step 3: 搭建脚手架**

`package.json` 至少包含脚本：

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:studio": "drizzle-kit studio"
  }
}
```

依赖：`next@16.4.3` `react@19.3.1` `react-dom@19.3.1` `drizzle-orm@0.45.4` `zod@4.6.7` `@node-rs/argon2`；dev：`typescript` `vitest` `drizzle-kit` `@types/node` `@types/react` `@types/react-dom` `tailwindcss@4.3.3` `@tailwindcss/postcss` `postcss`。

`tsconfig.json` 的 `compilerOptions` 必须包含：

```json
{
  "strict": true,
  "noUncheckedIndexedAccess": true,
  "exactOptionalPropertyTypes": true,
  "noImplicitOverride": true,
  "noFallthroughCasesInSwitch": true,
  "module": "esnext",
  "moduleResolution": "bundler",
  "target": "es2022",
  "jsx": "preserve",
  "plugins": [{ "name": "next" }],
  "paths": { "@/*": ["./src/*"] }
}
```

`next.config.ts`：`{ output: 'standalone' }`。

`docker-compose.test.yml`：

```yaml
services:
  db-test:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: terra
      POSTGRES_PASSWORD: terra
      POSTGRES_DB: terra_test
    ports: ["55432:5432"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U terra -d terra_test"]
      interval: 2s
      timeout: 3s
      retries: 30
```

`vitest.config.ts`：`environment: 'node'`，`setupFiles: ['./tests/setup.ts']`，`include: ['**/*.test.ts']`，alias `@` → `./src`。

`tests/setup.ts`：读取 `TEST_DATABASE_URL`（默认 `postgres://terra:terra@localhost:55432/terra_test`），执行 `drizzle-kit migrate` 的 SQL（用 `migrate()` from `drizzle-orm/node-postgres/migrator`，指向 `drizzle/` 目录）。

`tests/db.ts` 导出 `resetDb()`：按外键依赖顺序 TRUNCATE 全部业务表，然后插入一行固定的测试 admin。**密码哈希写死为常量 `TEST_ADMIN_HASH`**（argon2id of `correct-horse-battery`，实现者用一次性脚本生成后粘进 `tests/db.ts`）——这样 Task 1 就能跑通，不必等 Task 3 的 `bootstrapAdmin()`。

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm vitest run tests/db.test.ts`
Expected: PASS —— 1 个测试通过

- [ ] **Step 5: 提交**

```bash
git add package.json tsconfig.json next.config.ts postcss.config.mjs vitest.config.ts docker-compose.test.yml .env.example src tests
git commit -m "chore: scaffold next 16 app with vitest harness"
```

---

### Task 2: 数据库 schema 与迁移

**Files:**
- Create: `src/server/db/schema.ts`, `src/server/db/client.ts`, `drizzle.config.ts`
- Create: `drizzle/0000_init.sql`（由 `pnpm db:generate` 产出，需人工补一条扩展与索引）
- Modify: `tests/db.ts`

**Interfaces:**
- Consumes: Task 1 的 `tests/db.ts`、`TEST_DATABASE_URL`
- Produces — `src/server/db/schema.ts` 导出以下 Drizzle 表对象（字段名照抄）：

| 导出名 | 关键字段 |
|---|---|
| `users` | `id`, `email` (unique), `passwordHash`, `name`, `role` (`'admin' \| 'author'`), `localePref` (`'zh' \| 'en'`, default `'zh'`), `createdAt`, `updatedAt` |
| `sessions` | `id`, `userId` → users, `tokenHash` (unique), `expiresAt`, `createdAt` |
| `categories` | `id`, `parentId` → categories (null), `slug`, `name`, `description` (null), `position` (int), `path` (text), `depth` (int), `createdAt`, `updatedAt`；`unique(parentId, slug)` |
| `tags` | `id`, `slug` (unique), `name`, `createdAt` |
| `posts` | `id`, `categoryId` → categories, `slug`, `title`, `summary` (null), `bodyMd`, `status` (`'draft' \| 'published' \| 'archived'`, default `'draft'`), `authorId` → users, `featured` (bool default false), `coverImage` (null), `publishedAt` (null), `createdAt`, `updatedAt`；`unique(categoryId, slug)` |
| `postTags` | `postId`, `tagId`，复合主键 |
| `postRevisions` | `id`, `postId` → posts, `title`, `summary` (null), `bodyMd`, `authorId` → users, `source` (`'human' \| 'agent'`), `createdAt` |
| `postViewDaily` | `postId`, `day` (date), `views` (int)，复合主键 |
| `postViewVisitors` | `postId`, `day` (date), `vidHash` (text)，复合主键 |
| `mcpTokens` | `id`, `name`, `tokenHash` (unique), `authorId` → users, `canPublish` (bool default false), `lastUsedAt` (null), `revokedAt` (null), `createdAt` |
| `auditLogs` | `id`, `actorType` (`'user' \| 'token'`), `actorId`, `action` (text), `targetType` (text), `targetId` (text), `meta` (jsonb), `createdAt` |
| `uploads` | `id`, `filename`, `storedPath`, `mime`, `bytes` (int), `uploaderId` → users, `createdAt` |
| `redirects` | `id`, `fromPath` (unique), `toPath`, `httpStatus` (int default 301), `createdAt` |
| `siteSettings` | `key` (pk), `value` (jsonb) |

  `src/server/db/client.ts` 导出 `db: NodePgDatabase<typeof schema>`。

- [ ] **Step 1: 写失败测试 —— schema 形状与索引**

`src/server/db/schema.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { db } from './client'

describe('schema', () => {
  it('has pg_trgm extension and trigram indexes', async () => {
    const ext = await db.execute(sql`select extname from pg_extension where extname = 'pg_trgm'`)
    expect(ext.rows.length).toBe(1)
    const idx = await db.execute(sql`select indexname from pg_indexes where indexname like '%_trgm'`)
    expect(idx.rows.map(r => r.indexname).sort()).toEqual([
      'posts_body_trgm', 'posts_summary_trgm', 'posts_title_trgm',
    ])
  })

  it('enforces unique top-level category slug', async () => {
    const names = await db.execute(sql`select indexname from pg_indexes where tablename='categories'`)
    expect(names.rows.map(r => r.indexname)).toContain('categories_top_level_slug_unique')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run src/server/db/schema.test.ts`
Expected: FAIL —— 表不存在 / `pg_trgm` 缺失

- [ ] **Step 3: 实现**

按上表写 `src/server/db/schema.ts`。`src/server/db/client.ts`：

```ts
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'

const globalForDb = globalThis as unknown as { pool?: Pool }
const pool = globalForDb.pool ?? new Pool({ connectionString: process.env.DATABASE_URL })
if (process.env.NODE_ENV !== 'production') globalForDb.pool = pool
export const db = drizzle(pool, { schema })
```

`drizzle.config.ts` 的 `out` 指向 `drizzle/`，`dialect: 'postgresql'`，`dbCredentials.url` 取 `DATABASE_URL`。

生成迁移后**手工追加**到 `drizzle/0000_init.sql` 末尾：

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS posts_title_trgm   ON posts USING gin (title   gin_trgm_ops);
CREATE INDEX IF NOT EXISTS posts_summary_trgm ON posts USING gin (summary gin_trgm_ops);
CREATE INDEX IF NOT EXISTS posts_body_trgm    ON posts USING gin (body_md gin_trgm_ops);
CREATE UNIQUE INDEX IF NOT EXISTS categories_top_level_slug_unique
  ON categories (slug) WHERE parent_id IS NULL;
```

`tests/db.ts` 的 `resetDb()` TRUNCATE 列表按依赖顺序写全 15 张表。

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm vitest run src/server/db/schema.test.ts`
Expected: PASS —— 2 个测试通过

- [ ] **Step 5: 提交**

```bash
git add src/server/db drizzle drizzle.config.ts tests
git commit -m "feat(db): schema for users, categories, posts, mcp tokens and audit"
```

---

### Task 3: 认证（密码 + 会话 + 登录页）

**Files:**
- Create: `src/server/auth/password.ts`, `src/server/auth/session.ts`, `src/server/services/auth.ts`
- Create: `src/app/login/page.tsx`, `src/app/api/auth/login/route.ts`, `src/app/api/auth/logout/route.ts`, `src/proxy.ts`
- Modify: `src/app/layout.tsx`
- Test: `src/server/auth/session.test.ts`

**Interfaces:**
- Consumes: Task 2 的 `users`、`sessions`
- Produces:
  - `src/server/auth/password.ts`：`hashPassword(plain: string): Promise<string>`（argon2id）、`verifyPassword(plain: string, hash: string): Promise<boolean>`
  - `src/server/auth/session.ts`：
    - `type SessionUser = { id: string; email: string; name: string; role: 'admin' | 'author' }`
    - `createSession(userId: string): Promise<{ token: string; expiresAt: Date }>` —— **不写 cookie**（保持纯函数，能在没有 request 上下文的测试里调用）
    - `setSessionCookie(token: string, expiresAt: Date): void` —— 写 cookie，由登录路由调用
    - `clearSessionCookie(): void`
    - `getSessionUser(): Promise<SessionUser | null>`
    - `requireUser(): Promise<SessionUser>`（无会话时 `redirect('/login')`）
    - `destroySession(): Promise<void>`
    - 常量 `SESSION_COOKIE = 'terra_session'`
  - `src/server/services/auth.ts`：`bootstrapAdmin(): Promise<void>`（`users` 为空时用 `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD` 建第一个 admin；已存在则 no-op）、`authenticate(email: string, password: string): Promise<SessionUser | null>`

- [ ] **Step 1: 写失败测试**

`src/server/auth/session.test.ts`：

```ts
import { describe, expect, it, beforeEach } from 'vitest'
import { db } from '../db/client'
import { resetDb } from '../../tests/db'
import { authenticate } from '../services/auth'
import { createSession, getSessionUser } from './session'

describe('auth', () => {
  beforeEach(async () => { await resetDb() })

  it('bootstraps the first admin', async () => {
    const user = await authenticate('admin@example.com', 'correct-horse-battery')
    expect(user?.role).toBe('admin')
  })

  it('rejects a wrong password', async () => {
    const user = await authenticate('admin@example.com', 'wrong')
    expect(user).toBeNull()
  })

  it('returns null for an unknown session token', async () => {
    const { token } = await createSession((await db.query.users.findFirst())!.id)
    expect(await getSessionUser()).toBeNull() // 测试环境未注入 cookie
    expect(token).toHaveLength(43) // 32 字节 base64url
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run src/server/auth/session.test.ts`
Expected: FAIL —— `Cannot find module './session'`

- [ ] **Step 3: 实现**

- `password.ts`：用 `@node-rs/argon2` 的 `hash(plain, { algorithm: Algorithm.Argon2id })` 与 `verify(hash, plain)`。
- `session.ts`：
  - `createSession`：生成 32 字节随机数 → base64url（43 字符）作为明文 token；库内存 `sha256(token)`；`expiresAt = now + 30 天`；通过 `cookies().set(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', expires: expiresAt })` 写 cookie；返回 `{ token, expiresAt }`。
  - `getSessionUser`：读 cookie → 无则返回 `null`；有则按 `sha256(token)` 查 `sessions`（`expiresAt > now`）→ join `users` → 返回 `SessionUser`；查不到或过期返回 `null`（**不抛错**）。
  - `requireUser`：调 `getSessionUser`，为 `null` 时 `redirect('/login')`。
  - `destroySession`：删除当前 cookie 对应的 `sessions` 行并清 cookie。
  - `sha256` 助手放 `src/server/services/auth.ts` 或独立的 `src/server/crypto.ts`（自行决定，但全项目只此一处实现）。
- `services/auth.ts`：`bootstrapAdmin()` 检查 `users` 表行数，为 0 时读 `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD`（缺失则抛错并打印明确提示）插入 admin；`authenticate` 按 email 查用户 → `verifyPassword` → 返回 `SessionUser`。
- `app/api/auth/login/route.ts`：`POST` 接 JSON `{ email, password }` → `authenticate` → 成功则 `createSession` 并返回 `{ ok: true }`（cookie 已在 `createSession` 内写入），失败返回 `401`。
- `app/api/auth/logout/route.ts`：`POST` → `destroySession()` → `{ ok: true }`。
- `app/login/page.tsx`：一个居中表单（邮箱 / 密码 / 提交），客户端组件，调 `POST /api/auth/login`，成功后 `router.push('/admin')`；失败显示表单下方的错误文案（主动语态，不道歉）。
- `src/proxy.ts`：`export const config = { matcher: ['/admin/:path*'] }`；若请求无 `terra_session` cookie 则 `NextResponse.redirect(new URL('/login', req.url))`；有 cookie 则放行（**真实校验在 admin layout**）。
- `src/app/layout.tsx`：加 `bootstrapAdmin()` 的调用（Server Component 顶层 await）——确保首个 admin 存在。

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm vitest run src/server/auth/session.test.ts`
Expected: PASS —— 3 个测试通过

- [ ] **Step 5: 提交**

```bash
git add src/server/auth src/server/services/auth.ts src/app/login src/app/api/auth src/proxy.ts src/app/layout.tsx
git commit -m "feat(auth): argon2id passwords, revocable sessions and admin bootstrap"
```

---

### Task 4: 分类服务（物化路径 + slug 互斥 + 移动事务 + 301）

**Files:**
- Create: `src/server/services/categories.ts`, `src/server/errors.ts`
- Test: `src/server/services/categories.test.ts`

**Interfaces:**
- Consumes: Task 2 的 `categories`、`redirects`、`posts`
- Produces:
  - `src/server/errors.ts`：
    ```ts
    export class DomainError extends Error {
      constructor(public readonly code: 'not_found' | 'conflict' | 'forbidden' | 'invalid' | 'unauthorized',
                  message: string,
                  public readonly details?: Record<string, unknown>)
    }
    ```
  - `src/server/services/categories.ts`：
    - `type Category = { id: string; parentId: string | null; slug: string; name: string; description: string | null; path: string; depth: number; position: number }`
    - `type CategoryNode = Category & { children: CategoryNode[]; postCount: number }`
    - `listCategoryTree(): Promise<CategoryNode[]>`（按 `position` 排序，postCount 含子树）
    - `getCategoryByPath(path: string): Promise<Category | null>`
    - `getCategoryById(id: string): Promise<Category | null>`
    - `createCategory(input: { parentId: string | null; slug: string; name: string; description?: string }): Promise<Category>`
    - `renameCategory(input: { id: string; name?: string; slug?: string }): Promise<Category>`
    - `moveCategory(input: { id: string; newParentId: string | null }): Promise<Category>`
    - `deleteCategory(id: string): Promise<void>`
    - `listDescendantPaths(id: string): Promise<string[]>`

- [ ] **Step 1: 写失败测试**（含 Review Focus #1）

`src/server/services/categories.test.ts`：

```ts
import { describe, expect, it, beforeEach } from 'vitest'
import { resetDb } from '../../../tests/db'
import { DomainError } from '../errors'
import { createCategory, moveCategory, renameCategory, deleteCategory } from './categories'
import { db } from '../db/client'
import { redirects } from '../db/schema'

describe('categories', () => {
  beforeEach(async () => { await resetDb() })

  it('builds a materialized path', async () => {
    const a = await createCategory({ parentId: null, slug: 'guide', name: '指南' })
    const b = await createCategory({ parentId: a.id, slug: 'rust', name: 'Rust' })
    expect(a.path).toBe('guide')
    expect(b.path).toBe('guide/rust')
    expect(b.depth).toBe(1)
  })

  it('rejects a top-level slug that collides with a reserved word', async () => {
    await expect(createCategory({ parentId: null, slug: 'admin', name: 'x' }))
      .rejects.toBeInstanceOf(DomainError)
  })

  it('rejects two top-level categories with the same slug', async () => {
    await createCategory({ parentId: null, slug: 'guide', name: 'a' })
    await expect(createCategory({ parentId: null, slug: 'guide', name: 'b' }))
      .rejects.toMatchObject({ code: 'conflict' })
  })

  it('writes a 301 for every descendant when moving a deep subtree', async () => {
    const a = await createCategory({ parentId: null, slug: 'guide', name: 'a' })
    const b = await createCategory({ parentId: a.id, slug: 'rust', name: 'b' })
    const c = await createCategory({ parentId: b.id, slug: 'async', name: 'c' })
    const x = await createCategory({ parentId: null, slug: 'ref', name: 'x' })
    await moveCategory({ id: a.id, newParentId: x.id })
    const rows = await db.select().from(redirects)
    const froms = rows.map(r => r.fromPath).sort()
    expect(froms).toContain('/guide')
    expect(froms).toContain('/guide/rust')
    expect(froms).toContain('/guide/rust/async')
  })

  it('refuses to delete a non-empty category', async () => {
    const a = await createCategory({ parentId: null, slug: 'guide', name: 'a' })
    const b = await createCategory({ parentId: a.id, slug: 'rust', name: 'b' })
    await expect(deleteCategory(a.id)).rejects.toMatchObject({ code: 'conflict' })
    await expect(deleteCategory(b.id)).resolves.toBeUndefined()
  })

  it('rewrites descendant paths and 301s when a slug changes', async () => {
    const a = await createCategory({ parentId: null, slug: 'guide', name: 'a' })
    const b = await createCategory({ parentId: a.id, slug: 'rust', name: 'b' })
    await renameCategory({ id: a.id, slug: 'manual' })
    const rows = await db.select().from(redirects)
    const froms = rows.map(r => r.fromPath).sort()
    expect(froms).toContain('/guide')
    expect(froms).toContain('/guide/rust')
    const moved = await db.query.categories.findFirst()
    expect(moved?.path).toBe('manual')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run src/server/services/categories.test.ts`
Expected: FAIL —— `Cannot find module './categories'`

- [ ] **Step 3: 实现**

- `errors.ts`：如上定义 `DomainError`。**全项目 service 层只抛 `DomainError`**，不直接抛原生错误——MCP 与 Server Actions 需要把同一错误映射成同一段文案。
- `categories.ts` 实现要点：
  - slug 校验：顶级 slug 命中保留字列表 → `DomainError('invalid', ...)`；slug 不匹配 `^[a-z0-9]+(-[a-z0-9]+)*$` → `DomainError('invalid', ...)`。
  - 同级 slug 唯一：靠 `unique(parentId, slug)` 约束捕获，冲突转成 `DomainError('conflict', ...)`；顶级额外靠 `categories_top_level_slug_unique`。
  - `createCategory`：`path = parent ? `${parent.path}/${slug}` : slug`；`depth = parent ? parent.depth + 1 : 0`。
  - `renameCategory`（改 slug）：收集自身 + 全部后代的旧 `path`，计算新 `path`，**在单个事务内**更新自身与所有后代的 `path`，并为每个受影响路径写一条 `redirects`（`fromPath = '/' + oldPath`，`toPath = '/' + newPath`）。改 slug 前先检查新 slug 与同级子分类/同级 slug 是否冲突（`DomainError('conflict')`）。
  - `moveCategory`：`newParentId` 不得是自身或自身后代（否则成环 → `DomainError('invalid')`）；同样在单事务内重算子树 path 并写全部 redirects。**测试断言的三个 fromPath 都必须出现**（含孙级分类）。
  - `deleteCategory`：存在子分类或存在文章 → `DomainError('conflict', '分类非空', { postCount, childCount })`；否则删除。
  - `listCategoryTree`：一次取全部分类 + 全部文章计数，在内存里组装树，按 `position` 排序。

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm vitest run src/server/services/categories.test.ts`
Expected: PASS —— 5 个测试通过

- [ ] **Step 5: 提交**

```bash
git add src/server/services/categories.ts src/server/errors.ts src/server/services/categories.test.ts
git commit -m "feat(categories): materialized tree, slug exclusivity and transactional 301s"
```

---

### Task 5: 文章服务（slug 生成、状态机、revision、乐观锁）

**Files:**
- Create: `src/server/services/posts.ts`, `src/server/slug.ts`
- Test: `src/server/services/posts.test.ts`, `src/server/slug.test.ts`

**Interfaces:**
- Consumes: Task 2 的 `posts`、`postRevisions`、`postTags`、`tags`；Task 4 的 `getCategoryByPath` / `getCategoryById`
- Produces:
  - `src/server/slug.ts`：
    - `isValidSlug(s: string): boolean`
    - `slugify(input: string): string` —— ASCII 标题直接 kebab-case；含中文时用 `pinyin` 转写（选型见规格 §12.3，实现者自定，但**必须**能把「用 MCP 装上发布能力」转成非空 ASCII kebab）；转写为空时返回 `''`
    - `ensureUniqueSlug(base: string, isTaken: (s: string) => boolean): string` —— 冲突时追加 `-2`、`-3`…，仍冲突则追加 `-<base36 随机>`
  - `src/server/services/posts.ts`：
    - `type PostStatus = 'draft' | 'published' | 'archived'`
    - `type Actor = { kind: 'user'; id: string; role: 'admin' | 'author' } | { kind: 'token'; id: string; authorId: string; role: 'admin' | 'author'; canPublish: boolean }`
    - `type Post = { id: string; categoryId: string; slug: string; title: string; summary: string | null; bodyMd: string; status: PostStatus; authorId: string; featured: boolean; coverImage: string | null; publishedAt: Date | null; createdAt: Date; updatedAt: Date }`
    - `type PostListItem = { id: string; slug: string; title: string; summary: string | null; status: PostStatus; authorId: string; categoryId: string; categoryPath: string; tags: { slug: string; name: string }[]; publishedAt: Date | null; updatedAt: Date }`
    - `createPost(input: { actor: Actor; categoryId: string; slug?: string; title: string; summary?: string; bodyMd: string; tags?: string[] }): Promise<Post>`
    - `updatePost(input: { actor: Actor; id: string; slug?: string; title?: string; summary?: string; bodyMd?: string; tags?: string[]; featured?: boolean; expectedUpdatedAt?: Date }): Promise<Post>`
    - `publishPost(input: { actor: Actor; id: string }): Promise<Post>`
    - `unpublishPost(input: { actor: Actor; id: string }): Promise<Post>`
    - `archivePost(input: { actor: Actor; id: string }): Promise<Post>`
    - `getPostById(id: string): Promise<Post | null>`
    - `getPostBySlug(categoryPath: string, slug: string): Promise<Post | null>`
    - `listPosts(query: { actor: Actor; categoryId?: string; categoryPathPrefix?: string; tag?: string; status?: PostStatus; authorId?: string; featured?: boolean; limit?: number; offset?: number }): Promise<{ items: PostListItem[]; total: number }>` —— `categoryPathPrefix` 匹配该分类**整棵子树**（`categories.path LIKE 'prefix/%'`）；默认只返回 `published`
    - `searchPosts(query: { actor: Actor; q: string; limit?: number }): Promise<PostListItem[]>`

- [ ] **Step 1: 写失败测试**（含 Review Focus #2 和 #5）

`src/server/slug.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { ensureUniqueSlug, isValidSlug, slugify } from './slug'

describe('slug', () => {
  it('accepts kebab-case only', () => {
    expect(isValidSlug('nextjs-mcp')).toBe(true)
    expect(isValidSlug('Nextjs')).toBe(false)
    expect(isValidSlug('a'.repeat(81))).toBe(false)
    expect(isValidSlug('has/slash')).toBe(false)
  })

  it('transliterates chinese titles', () => {
    expect(slugify('用 MCP 装上发布能力')).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  })

  it('disambiguates collisions', () => {
    const taken = new Set(['guide', 'guide-2'])
    expect(ensureUniqueSlug('guide', s => taken.has(s))).toBe('guide-3')
  })
})
```

`src/server/services/posts.test.ts`：

```ts
import { describe, expect, it, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { resetDb } from '../../../tests/db'
import { createCategory } from './categories'
import { createPost, publishPost, updatePost } from './posts'
import { db } from '../db/client'
import { postRevisions } from '../db/schema'

let author: { kind: 'user'; id: string; role: 'author' } = { kind: 'user', id: '', role: 'author' }

describe('posts', () => {
  beforeEach(async () => {
    await resetDb()
    const u = await db.query.users.findFirst()
    author.id = u!.id
  })

  it('creates a draft and returns the generated slug', async () => {
    const cat = await createCategory({ parentId: null, slug: 'guide', name: '指南' })
    const post = await createPost({ actor: author, categoryId: cat.id, title: '用 MCP 发布博客', bodyMd: '# hi' })
    expect(post.status).toBe('draft')
    expect(post.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  })

  it('rejects a slug that already exists in the same category', async () => {
    const cat = await createCategory({ parentId: null, slug: 'guide', name: '指南' })
    await createPost({ actor: author, categoryId: cat.id, slug: 'hello', title: 'A', bodyMd: 'x' })
    await expect(createPost({ actor: author, categoryId: cat.id, slug: 'hello', title: 'B', bodyMd: 'y' }))
      .rejects.toMatchObject({ code: 'conflict' })
  })

  it('writes a revision only when content fields change', async () => {
    const cat = await createCategory({ parentId: null, slug: 'guide', name: '指南' })
    const post = await createPost({ actor: author, categoryId: cat.id, title: 'A', bodyMd: 'x' })
    await updatePost({ actor: author, id: post.id, bodyMd: 'y' })
    const revs = await db.select().from(postRevisions).where(eq(postRevisions.postId, post.id))
    expect(revs.length).toBe(1)
  })

  it('refuses a stale update instead of overwriting', async () => {
    const cat = await createCategory({ parentId: null, slug: 'guide', name: '指南' })
    const post = await createPost({ actor: author, categoryId: cat.id, title: 'A', bodyMd: 'x' })
    const stale = new Date(post.updatedAt.getTime() - 1000)
    await expect(updatePost({ actor: author, id: post.id, bodyMd: 'y', expectedUpdatedAt: stale }))
      .rejects.toMatchObject({ code: 'conflict' })
  })

  it('lets a token publish only when canPublish is true', async () => {
    const cat = await createCategory({ parentId: null, slug: 'guide', name: '指南' })
    const post = await createPost({ actor: author, categoryId: cat.id, title: 'A', bodyMd: 'x' })
    const token = { kind: 'token', id: 't1', authorId: author.id, role: 'author', canPublish: false } as const
    await expect(publishPost({ actor: token, id: post.id })).rejects.toMatchObject({ code: 'forbidden' })
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run src/server/slug.test.ts src/server/services/posts.test.ts`
Expected: FAIL —— `Cannot find module './slug'`

- [ ] **Step 3: 实现**

- `slug.ts`：`isValidSlug` 用 `^[a-z0-9]+(-[a-z0-9]+)*$` + 长度 1–80；`slugify` 先 NFKC 归一化、去掉非字母数字字符、kebab-case；含 CJK 时调用 `pinyin`（`pinyin(title, { toneType: 'none', type: 'array' })`）拼回 ASCII 再 kebab；结果为空返回 `''`。`ensureUniqueSlug` 从 `base` 起，冲突则 `base-2`、`base-3`…，直到 `-<base36 随机 6 位>`。
- `posts.ts` 实现要点：
  - **slug 生成**：显式传入 → 校验合法性 + 同分类唯一（冲突 → `DomainError('conflict', ..., { taken: [...] })`）；未传入 → `slugify(title)`，再 `ensureUniqueSlug`。
  - **slug 互斥**：文章 slug 必须不等于其所属分类的**同级子分类**的 slug，也不等于同分类已有文章 slug。冲突 → `DomainError('conflict')`。
  - **叶子校验**：目标分类若还有子分类 → `DomainError('invalid', '文章只能放在叶子分类')`。
  - **revision**：仅当 `title` / `summary` / `bodyMd` 任一发生变化时，写一条 `postRevisions`（`source` = actor.kind === 'token' ? 'agent' : 'human'）。
  - **乐观锁**：`updatePost` 传入 `expectedUpdatedAt` 时，与库中 `updatedAt` 比较（毫秒级容差 1ms），不一致 → `DomainError('conflict', '文章已被他人修改')`。
  - **状态机**：`publishPost` 要求 `actor.kind === 'token' ? actor.canPublish : true`；token 的 `canPublish=false` → `DomainError('forbidden')`。发布时写 `publishedAt`。`unpublishPost` 回到 `draft` 并清 `publishedAt`；`archivePost` 置 `archived`。**状态流转不写 revision**。
  - **标签**：`tags?: string[]` 按名称归一化为小写 slug，不存在则创建；写入 `postTags`（整体替换语义：传入即最终集合，未传则不动）。
  - **列表可见性**：`listPosts` 默认只返回 `published`；`status: 'draft'` 时只有 `actor` 本人（`authorId === actor.id` 或 token 的 `authorId`）或 admin 能看到。

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm vitest run src/server/slug.test.ts src/server/services/posts.test.ts`
Expected: PASS —— 8 个测试通过

- [ ] **Step 5: 提交**

```bash
git add src/server/slug.ts src/server/slug.test.ts src/server/services/posts.ts src/server/services/posts.test.ts
git commit -m "feat(posts): slug generation, state machine, revisions and optimistic locking"
```

---

### Task 6: 标签、媒体、审计服务

**Files:**
- Create: `src/server/services/tags.ts`, `src/server/services/media.ts`, `src/server/audit.ts`, `src/server/storage/index.ts`, `src/server/storage/local-disk.ts`, `src/app/uploads/[...path]/route.ts`
- Test: `src/server/services/tags.test.ts`, `src/server/services/media.test.ts`

**Interfaces:**
- Consumes: Task 2 的 `tags`、`postTags`、`uploads`、`auditLogs`；Task 5 的 `Actor`
- Produces:
  - `src/server/audit.ts`：`recordAudit(input: { actor: Actor; action: string; target: { type: string; id: string }; meta?: Record<string, unknown> }): Promise<void>` —— `actor.kind === 'token'` 时 `actorType='token'`、`actorId=actor.id`；否则 `'user'` / `actor.id`。
  - `src/server/services/tags.ts`：`listTags(): Promise<{ id: string; slug: string; name: string; postCount: number }[]>`、`createTag(name: string): Promise<Tag>`、`renameTag(id: string, name: string): Promise<Tag>`、`mergeTags(sourceId: string, targetId: string): Promise<void>`（把 source 的 `postTags` 迁到 target，同一篇文章只留一条，再删 source）
  - `src/server/storage/index.ts`：
    ```ts
    export interface Storage {
      put(key: string, bytes: Buffer, mime: string): Promise<{ storedPath: string; url: string }>
      delete(storedPath: string): Promise<void>
    }
    export const storage: Storage  // 当前实现 = LocalDiskStorage
    ```
  - `src/server/storage/local-disk.ts`：`LocalDiskStorage` 写入 `process.env.UPLOAD_DIR`，按 `YYYY/MM/<base36>-<rand>.<ext>` 生成路径，返回 `/uploads/<key>` 形式的 URL。
  - `src/server/services/media.ts`：`uploadMedia(input: { actor: Actor; bytes: Buffer; filename: string; mime: string }): Promise<{ id: string; url: string; markdown: string }>`、`deleteMedia(actor: Actor, id: string): Promise<void>`、`listMedia(): Promise<{ id: string; filename: string; url: string; mime: string; bytes: number; createdAt: Date }[]>`

- [ ] **Step 1: 写失败测试**（含 Review Focus #4）

`src/server/services/media.test.ts`：

```ts
import { describe, expect, it, beforeEach } from 'vitest'
import { resetDb } from '../../../tests/db'
import { uploadMedia } from './media'

const actor = { kind: 'user', id: 'u1', role: 'admin' } as const

describe('media', () => {
  beforeEach(async () => { await resetDb() })

  it('rejects svg', async () => {
    await expect(uploadMedia({ actor, bytes: Buffer.from('<svg onload="x()"/>'), filename: 'a.svg', mime: 'image/svg+xml' }))
      .rejects.toMatchObject({ code: 'invalid' })
  })

  it('rejects a payload whose magic bytes do not match the extension', async () => {
    const svg = Buffer.from('<svg onload="x()"/>')
    await expect(uploadMedia({ actor, bytes: svg, filename: 'a.png', mime: 'image/png' }))
      .rejects.toMatchObject({ code: 'invalid' })
  })

  it('accepts a real png and ignores the client filename', async () => {
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex')
    const out = await uploadMedia({ actor, bytes: png, filename: '../../etc/passwd.png', mime: 'image/png' })
    expect(out.url).toMatch(/^\/uploads\/\d{4}\/\d{2}\/[a-z0-9]+-[a-z0-9]+\.png$/)
    expect(out.markdown).toBe(`![](${out.url})`)
  })
})
```

`src/server/services/tags.test.ts`：

```ts
import { describe, expect, it, beforeEach } from 'vitest'
import { resetDb } from '../../../tests/db'
import { createTag, mergeTags, listTags } from './tags'

describe('tags', () => {
  beforeEach(async () => { await resetDb() })

  it('normalizes slugs to lowercase', async () => {
    const t = await createTag('NextJS')
    expect(t.slug).toBe('nextjs')
  })

  it('merges one tag into another without duplicating article links', async () => {
    const a = await createTag('mcp')
    const b = await createTag('agent')
    await mergeTags(a.id, b.id)
    const tags = await listTags()
    expect(tags.map(t => t.slug)).toEqual(['agent'])
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run src/server/services/media.test.ts src/server/services/tags.test.ts`
Expected: FAIL —— `Cannot find module './media'`

- [ ] **Step 3: 实现**

- `media.ts`：
  - **magic bytes 校验**（不信任扩展名也不信任 MIME）：PNG 签名 `89 50 4E 47 0D 0A 1A 0A`；JPEG `FF D8 FF`；GIF `47 49 46 38`；WEBP `RIFF....WEBP`。字节头不匹配 → `DomainError('invalid', '文件内容与声明的类型不符')`。
  - 允许类型：`image/png` `image/jpeg` `image/webp` `image/gif`；**SVG 直接拒**。
  - 大小上限 10MB → 超限 `DomainError('invalid')`。
  - **文件名由服务端生成**（`storage.put` 内部生成），绝不拼接用户提供的 `filename`。
  - 写入 `uploads` 表：`filename` 存服务端生成的名字，`storedPath` 存 key，`mime` 存校验后的真实类型，`bytes` 存长度，`uploaderId` = actor 对应的用户 id（token 用其 `authorId`）。
- `tags.ts`：`slug` = 名称小写 + 非字母数字转 `-` + 截断到 80；已存在则返回既有记录（幂等）；`mergeTags` 在事务内迁移 `postTags`（`ON CONFLICT DO NOTHING` 语义）后删除 source。
- `audit.ts`：`recordAudit` 写 `auditLogs`，`meta` 存 jsonb。
- `storage/local-disk.ts`：`put` 先 `mkdir -p` 再写文件；`delete` 用 `rm`（忽略不存在）。
- `src/app/uploads/[...path]/route.ts`：`GET` 从 `UPLOAD_DIR` 读文件并返回，响应头 `content-type` 按扩展名判定，`cache-control: public, max-age=31536000, immutable`（文件名带随机串，内容不可变）；**路径必须防目录穿越**（`..` 一律拒绝，返回 400）。

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm vitest run src/server/services/media.test.ts src/server/services/tags.test.ts`
Expected: PASS —— 5 个测试通过

- [ ] **Step 5: 提交**

```bash
git add src/server/services/tags.ts src/server/services/media.ts src/server/audit.ts src/server/storage
git commit -m "feat(media): magic-byte upload validation, tag merge and audit log"
```

---

# Phase 2 — 公开站点

### Task 7: 设计系统（令牌、字体、暗色、i18n 基座）

**Files:**
- Create: `src/app/globals.css`, `src/lib/utils.ts`, `src/i18n/index.ts`, `src/i18n/dictionaries/zh.ts`, `src/i18n/dictionaries/en.ts`, `src/components/layout/ThemeToggle.tsx`, `src/components/layout/LocaleToggle.tsx`
- Modify: `src/app/layout.tsx`
- Create: `src/components/ui/button.tsx`, `src/components/ui/input.tsx`（shadcn 基础件，其余在 Task 12 起按需加）
- Test: `src/i18n/i18n.test.ts`

**Interfaces:**
- Consumes: 无
- Produces:
  - `src/i18n/index.ts`：
    ```ts
    export type Locale = 'zh' | 'en'
    export function getLocale(): Locale          // cookie terrawiki_locale → Accept-Language → 'zh'
    export function getDictionary(locale: Locale): Dictionary
    export function t(locale: Locale, key: keyof Dictionary): string
    ```
    `Dictionary` 的形状由 `zh.ts` 定义，`en.ts` 为 `typeof zh`（类型必须完全一致，缺一个键就编译不过）。
  - CSS 变量名（Tailwind v4 `@theme inline` 中定义）：`--color-paper` `--color-surface` `--color-ink` `--color-ink-muted` `--color-rule` `--color-accent` `--color-accent-hover` `--color-accent-soft` `--color-code-bg` `--color-code-ink` `--color-danger` `--color-success`，`.dark` 下覆盖暗色值。

- [ ] **Step 1: 写失败测试**

`src/i18n/i18n.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { getDictionary } from './index'
import zh from './dictionaries/zh'
import en from './dictionaries/en'

describe('i18n', () => {
  it('zh and en have identical key sets', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort())
  })

  it('uses sentence case without filler', () => {
    for (const value of Object.values(zh)) {
      expect(value).not.toMatch(/[，。]$/) // 中文条目不以句号结尾
    }
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run src/i18n/i18n.test.ts`
Expected: FAIL —— `Cannot find module './index'`

- [ ] **Step 3: 实现**

- `globals.css`：
  - `:root` 定义亮色变量（值照抄 Global Constraints），`.dark` 覆盖暗色值。
  - `@theme inline` 把变量映射成 Tailwind 工具类（`bg-paper`、`text-ink`、`border-rule` 等）。
  - 字体族变量：`--font-serif`（Noto Serif SC）、`--font-sans`（Inter + CJK 系统栈）、`--font-mono`（JetBrains Mono）。
  - 排版：正文 `font-size: 16px; line-height: 1.75`；文章内容列 `max-width: 68ch`。
  - `@media (prefers-reduced-motion: reduce)` 把所有动画时长归零。
  - 可见焦点态：`:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px }`。
- `src/app/layout.tsx`：`next/font` 加载 Inter / Noto Serif SC / JetBrains Mono；`<html lang={locale}>`；包裹 `ThemeProvider`（next-themes，`attribute="class"`，`defaultTheme="system"`）。
- `i18n/dictionaries/zh.ts`：至少包含这些键——`siteName` `navSearch` `navLogin` `navAdmin` `themeToggle` `localeToggle` `homeTitle` `homeLatest` `homeFeatured` `homeCategories` `categoryEmpty` `categoryPosts` `postPublished` `postUpdated` `postReadingTime` `postViews` `postTags` `postTableOfContents` `tagIndex` `searchPlaceholder` `searchResults` `searchNoResults` `searchQuery` `notFound` `notFoundHint` `backHome` `skipToContent` `copyCode` `copied`。
- `en.ts` 为同构英文版。
- `ThemeToggle` / `LocaleToggle`：客户端组件，分别切 `next-themes` 的 `theme` 与写 `terrawiki_locale` cookie 后 `router.refresh()`。

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm vitest run src/i18n/i18n.test.ts`
Expected: PASS —— 2 个测试通过

- [ ] **Step 5: 提交**

```bash
git add src/app/globals.css src/app/layout.tsx src/i18n src/lib src/components
git commit -m "feat(ui): design tokens, bilingual dictionary and theme toggle"
```

---

### Task 8: Markdown 渲染管线（Shiki、代码窗格、目录）

**Files:**
- Create: `src/server/markdown/shiki.ts`, `src/server/markdown/render.tsx`, `src/server/markdown/toc.ts`, `src/components/article/CodePane.tsx`, `src/components/article/TableOfContents.tsx`, `src/components/article/Markdown.tsx`
- Test: `src/server/markdown/render.test.ts`

**Interfaces:**
- Consumes: Task 7 的 CSS 变量
- Produces:
  - `src/server/markdown/render.tsx`：
    ```ts
    export type TocEntry = { id: string; text: string; depth: 2 | 3 }
    export async function renderMarkdown(md: string): Promise<{ html: string; toc: TocEntry[] }>
    ```
  - `src/server/markdown/toc.ts`：`extractToc(html: string): TocEntry[]` —— 抽 `<h2>` / `<h3>` 的 `id` 与文本。
  - `src/components/article/Markdown.tsx`：`<Markdown html={string} />` —— 渲染 `dangerouslySetInnerHTML` 的容器，包裹 `.prose` 样式作用域。

- [ ] **Step 1: 写失败测试**

`src/server/markdown/render.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { renderMarkdown } from './render'

describe('markdown', () => {
  it('renders a code fence with a file-path header', async () => {
    const { html } = await renderMarkdown('```ts title="src/app/api/mcp/route.ts"\nconst a = 1\n```')
    expect(html).toContain('src/app/api/mcp/route.ts')
    expect(html).toContain('code-pane')
  })

  it('does not parse raw html', async () => {
    const { html } = await renderMarkdown('<script>alert(1)</script>')
    expect(html).not.toContain('<script>')
  })

  it('builds a table of contents from h2 and h3', async () => {
    const { toc } = await renderMarkdown('## 准备\n\n### 安装\n\n## 配置\n')
    expect(toc.map(t => t.depth)).toEqual([2, 3, 2])
    expect(toc[0]?.text).toBe('准备')
  })

  it('highlights for both light and dark themes', async () => {
    const { html } = await renderMarkdown('```ts\nconst a = 1\n```')
    expect(html).toContain('--shiki-light')
    expect(html).toContain('--shiki-dark')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run src/server/markdown/render.test.ts`
Expected: FAIL —— `Cannot find module './render'`

- [ ] **Step 3: 实现**

- `shiki.ts`：用 `shiki` 的 `createHighlighter`（`themes: ['github-light', 'vitesse-dark']`, `langs: ['ts','tsx','js','jsx','json','bash','sql','yaml','md','python','go','rust','diff','html','css']`），单例缓存。生成时用 `transformers` 把 token 色写成 CSS 变量形式（`--shiki-light` / `--shiki-dark`），**不内联具体颜色**——`.dark` 下由 CSS 切换。
- `render.tsx`：`react-markdown` + `remark-gfm` + `rehype-slug` + `github-slugger`。**不启用 `rehype-raw`**。自定义 `code` 渲染器：读取 `node.meta` 中的 `title="..."`，把输出包成 `<div class="code-pane">` + 顶栏（文件名 + 语言标签 + 复制按钮 `data-code`）。
- `toc.ts`：用正则从渲染出的 HTML 里抽 `<h2 id="...">` / `<h3 id="...">`。
- `CodePane.tsx`：客户端组件，复制按钮用 `navigator.clipboard.writeText`，成功后在 2 秒内把文案切成「已复制」。
- `TableOfContents.tsx`：客户端组件，`IntersectionObserver` 高亮当前小节（`rootMargin` 实现者自定），点击平滑滚动到锚点。

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm vitest run src/server/markdown/render.test.ts`
Expected: PASS —— 4 个测试通过

- [ ] **Step 5: 提交**

```bash
git add src/server/markdown src/components/article
git commit -m "feat(markdown): shiki dual-theme highlighting, code pane and toc"
```

---

### Task 9: 路由消歧与公共页面

**Files:**
- Create: `src/server/routes/resolve.ts`, `src/app/(public)/layout.tsx`, `src/app/(public)/[...segments]/page.tsx`, `src/app/(public)/page.tsx`
- Create: `src/components/layout/TopBar.tsx`, `src/components/layout/CategoryTree.tsx`, `src/components/article/MetaLine.tsx`
- Test: `src/server/routes/resolve.test.ts`

**Interfaces:**
- Consumes: Task 4 的 `getCategoryByPath` / `listCategoryTree`；Task 5 的 `getPostBySlug` / `listPosts`；Task 8 的 `renderMarkdown`
- Produces:
  - `src/server/routes/resolve.ts`：
    ```ts
    export type ResolvedRoute =
      | { kind: 'home' }
      | { kind: 'category'; categoryId: string; path: string }
      | { kind: 'post'; postId: string; categoryPath: string; slug: string }
      | { kind: 'redirect'; to: string }
    export async function resolvePath(segments: string[]): Promise<ResolvedRoute | null>
    ```
    解析顺序**严格**为：① 空 segments → `home`；② `categories.path === segments.join('/')` → category；③ 末段作 slug、其余作分类路径查**已发布**文章 → post；④ `redirects.fromPath === '/'+segments.join('/')` → redirect；⑤ `null`。
  - `src/app/(public)/[...segments]/page.tsx`：`export const dynamic = 'force-dynamic'`；调用 `resolvePath`；按 kind 分派；`redirect` → `permanentRedirect(to)`；`null` → `notFound()`。

- [ ] **Step 1: 写失败测试**

`src/server/routes/resolve.test.ts`：

```ts
import { describe, expect, it, beforeEach } from 'vitest'
import { resetDb } from '../../../tests/db'
import { resolvePath } from './resolve'
import { createCategory } from '../services/categories'
import { createPost, publishPost } from '../services/posts'
import { db } from '../db/client'
import { redirects } from '../db/schema'

describe('route resolution', () => {
  beforeEach(async () => { await resetDb() })
  let actor: { kind: 'user'; id: string; role: 'admin' } = { kind: 'user', id: '', role: 'admin' }

  it('prefers a category path over an article', async () => {
    const u = await db.query.users.findFirst(); actor.id = u!.id
    const cat = await createCategory({ parentId: null, slug: 'guide', name: '指南' })
    await createPost({ actor, categoryId: cat.id, slug: 'hello', title: 'A', bodyMd: 'x' })
    await publishPost({ actor, id: (await db.query.posts.findFirst())!.id })
    expect((await resolvePath(['guide']))!.kind).toBe('category')
    expect((await resolvePath(['guide', 'hello']))!.kind).toBe('post')
  })

  it('does not expose drafts publicly', async () => {
    const u = await db.query.users.findFirst(); actor.id = u!.id
    const cat = await createCategory({ parentId: null, slug: 'guide', name: '指南' })
    await createPost({ actor, categoryId: cat.id, slug: 'hello', title: 'A', bodyMd: 'x' })
    expect(await resolvePath(['guide', 'hello'])).toBeNull()
  })

  it('returns a redirect when a path was moved', async () => {
    const u = await db.query.users.findFirst(); actor.id = u!.id
    const cat = await createCategory({ parentId: null, slug: 'guide', name: '指南' })
    await db.insert(redirects).values({ fromPath: '/old', toPath: '/guide', httpStatus: 301 })
    expect(await resolvePath(['old'])).toEqual({ kind: 'redirect', to: '/guide' })
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run src/server/routes/resolve.test.ts`
Expected: FAIL —— `Cannot find module './resolve'`

- [ ] **Step 3: 实现**

- `resolve.ts` 按上面 5 步顺序实现，**顺序不可调换**。文章查询只取 `status='published'`。
- `app/(public)/layout.tsx`（**新建**）：公开站点的壳——顶栏 + 三栏栅格（左 `CategoryTree` 240px / 中内容列 / 右 `TableOfContents` 200px）；窄屏降级为单栏（目录收进文章顶部下拉）。后台 `/admin` 有自己的 layout，**不共用这个壳**。
- `app/(public)/[...segments]/page.tsx`：
  - 分类页：标题 = 分类名 + 描述；列表 = **该分类整棵子树**下已发布文章（`listPosts({ categoryPathPrefix })`），**分页 20 条/页**，通过 `?page=` 翻页；**读 `?tag=` 参数并按标签过滤**（文章页的标签链接指向 `/{分类路径}?tag={slug}`）；每条显示标题 / 摘要 / 日期 / 阅读时长 / 标签。
  - 文章页：标题、MetaLine（日期 · 阅读时长 · 浏览量 · 标签）、`<Markdown html={...} />`、右侧 `TableOfContents`。
  - `generateMetadata`：文章页输出 `title` / `description`（summary）/ `openGraph`。
- `app/(public)/page.tsx`：首页 = 最近更新流（20 条）+ 置顶文章 + 分类快捷入口（来自 `listCategoryTree` 的顶级节点）。
- `CategoryTree.tsx`：客户端组件，从 `listCategoryTree` 的结果渲染可折叠树；当前路径用 `accent` 左标记 + 加粗；点击跳到 `/{path}`。
- `TopBar.tsx`：站名、分类快捷链接、搜索框、`SearchToggle`、主题切换、语言切换。
- `MetaLine.tsx`：日期、阅读时长（按 `bodyMd` 的中文字符数 + 英文单词数估算）、标签链接（指向 `/{categoryPath}?tag={slug}`）、浏览量占位。

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm vitest run src/server/routes/resolve.test.ts`
Expected: PASS —— 3 个测试通过

- [ ] **Step 5: 提交**

```bash
git add src/server/routes src/app/\(public\) src/components/layout src/components/article
git commit -m "feat(public): single catch-all route resolution and category/article pages"
```

---

### Task 10: 标签页、搜索、站点地图、RSS

**Files:**
- Create: `src/app/(public)/tags/page.tsx`, `src/app/(public)/tags/[slug]/page.tsx`, `src/app/(public)/search/page.tsx`, `src/app/(public)/sitemap/page.tsx`, `src/app/sitemap.ts`, `src/app/robots.ts`, `src/app/rss.xml/route.ts`
- Test: `src/server/services/posts.test.ts`（追加搜索用例）

**Interfaces:**
- Consumes: Task 5 的 `searchPosts` / `listPosts`；Task 6 的 `listTags`；Task 4 的 `listCategoryTree`
- Produces:
  - `src/app/rss.xml/route.ts`：`GET` 返回 `application/rss+xml`，包含全部已发布文章的标题、链接、摘要、`pubDate`。

- [ ] **Step 1: 写失败测试**（追加到 `src/server/services/posts.test.ts`）

```ts
  it('finds a chinese two-character term in the title', async () => {
    const cat = await createCategory({ parentId: null, slug: 'guide', name: '指南' })
    const p = await createPost({ actor, categoryId: cat.id, title: '索引的原理', bodyMd: '正文' })
    await publishPost({ actor, id: p.id })
    const hits = await searchPosts({ actor, q: '索引' })
    expect(hits.map(h => h.id)).toContain(p.id)
  })

  it('finds an english term in the body', async () => {
    const cat = await createCategory({ parentId: null, slug: 'guide', name: '指南' })
    const p = await createPost({ actor, categoryId: cat.id, title: 'A', bodyMd: 'we use drizzle for the query layer' })
    await publishPost({ actor, id: p.id })
    const hits = await searchPosts({ actor, q: 'drizzle' })
    expect(hits.map(h => h.id)).toContain(p.id)
  })
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run src/server/services/posts.test.ts -t 'finds a'`
Expected: FAIL —— `searchPosts` 未实现或未命中

- [ ] **Step 3: 实现**
- 追加上面两个用例时，**同步在 `src/server/services/posts.test.ts` 的 import 里补上 `searchPosts`**（该文件已有 `createPost` / `publishPost`）。

- `searchPosts`：SQL 用 `title ILIKE %q% OR summary ILIKE %q% OR body_md ILIKE %q%`，并用 `similarity(title, q)` 与 `similarity(summary, q)` 排序权重；只返回 `published`；`q` 为空返回空数组。
- 页面：
  - `/tags` —— 全局标签索引，按 postCount 倒序。
  - `/tags/[slug]` —— 该标签下全部已发布文章（跨分类），每条显示所属分类路径。
  - `/search?q=` —— 搜索结果页，标题显示查询词与命中数；无结果时给出一句引导（不道歉、不空屏）。
  - `/sitemap` —— HTML 索引页：列出所有分类（带路径）与全部已发布文章。
- `/sitemap.xml`（`app/sitemap.ts`）：列出所有分类页与文章页的绝对 URL（用 `SITE_URL`）。
- `/robots.txt`（`app/robots.ts`）：允许抓取，`Disallow: /admin`。
- `/rss.xml`：手写 RSS 2.0 XML，文章按 `publishedAt` 倒序，链接用 `SITE_URL + 路径`。

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm vitest run src/server/services/posts.test.ts`
Expected: PASS —— 全部测试通过

- [ ] **Step 5: 提交**

```bash
git add src/app
git commit -m "feat(public): tag index, search, sitemap and rss"
```

---

### Task 11: 浏览量统计

**Files:**
- Create: `src/server/services/views.ts`, `src/app/api/track/route.ts`, `src/components/article/ViewCounter.tsx`
- Test: `src/server/services/views.test.ts`

**Interfaces:**
- Consumes: Task 2 的 `postViewDaily`、`postViewVisitors`
- Produces:
  - `src/server/services/views.ts`：
    ```ts
    export async function trackView(input: { postId: string; vid: string }): Promise<boolean>  // true = 本次计了新的一次
    export async function getViewCount(postId: string): Promise<number>
    ```
  - `src/app/api/track/route.ts`：`POST` 接 `{ postId }`；从 `vid` cookie 取或生成 UUIDv4；调用 `trackView`；**总是返回 204**，不泄露计数。
  - `VID` cookie 名：`terra_vid`，httpOnly，1 年。

- [ ] **Step 1: 写失败测试**

`src/server/services/views.test.ts`：

```ts
import { describe, expect, it, beforeEach } from 'vitest'
import { resetDb } from '../../../tests/db'
import { getViewCount, trackView } from './views'

async function createTestPost(): Promise<string> {
  const { db } = await import('../db/client')
  const { createCategory } = await import('../services/categories')
  const { createPost } = await import('../services/posts')
  const admin: { kind: 'user'; id: string; role: 'admin' } = {
    kind: 'user',
    id: (await db.query.users.findFirst())!.id,
    role: 'admin',
  }
  const cat = await createCategory({ parentId: null, slug: 'guide', name: '指南' })
  const post = await createPost({ actor: admin, categoryId: cat.id, title: 'A', bodyMd: 'x' })
  return post.id
}

describe('views', () => {
  beforeEach(async () => { await resetDb() })

  it('counts the same visitor once per day', async () => {
    const postId = await createTestPost()
    expect(await trackView({ postId, vid: 'visitor-a' })).toBe(true)
    expect(await trackView({ postId, vid: 'visitor-a' })).toBe(false)
    expect(await trackView({ postId, vid: 'visitor-b' })).toBe(true)
    expect(await getViewCount(postId)).toBe(2)
  })

  it('stores a hash, not the raw visitor id', async () => {
    const { db } = await import('../db/client')
    const { postViewVisitors } = await import('../db/schema')
    const postId = await createTestPost()
    await trackView({ postId, vid: 'raw-uuid-value' })
    const rows = await db.select().from(postViewVisitors)
    expect(rows[0]?.vidHash).not.toBe('raw-uuid-value')
    expect(rows[0]?.vidHash).toHaveLength(64)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run src/server/services/views.test.ts`
Expected: FAIL —— `Cannot find module './views'`

- [ ] **Step 3: 实现**

- `trackView`：`vidHash = sha256(vid + process.env.VID_SALT)`；`INSERT INTO post_view_visitors ... ON CONFLICT DO NOTHING` 并检查 `rowCount`；为 1 时 `upsert post_view_daily` 把当日 `views` 加 1 并返回 `true`，否则 `false`。
- `getViewCount`：`SELECT COALESCE(SUM(views),0) FROM post_view_daily WHERE post_id = $1`。
- `ViewCounter.tsx`：客户端组件，挂载后 `navigator.sendBeacon('/api/track', blob)`（降级 `fetch` 带 `keepalive: true`），不阻塞渲染；数字用服务端渲染的初值，不做客户端自增。

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm vitest run src/server/services/views.test.ts`
Expected: PASS —— 2 个测试通过

- [ ] **Step 5: 提交**

```bash
git add src/server/services/views.ts src/app/api/track src/components/article/ViewCounter.tsx
git commit -m "feat(stats): daily de-duplicated view counter"
```

---

# Phase 3 — 后台管理

### Task 12: 后台壳、登录后布局、文章列表与仪表盘

**Files:**
- Create: `src/app/admin/layout.tsx`, `src/app/admin/page.tsx`, `src/app/admin/posts/page.tsx`, `src/components/admin/PostTable.tsx`, `src/components/admin/AdminNav.tsx`
- Modify: `src/app/layout.tsx`（保留公共布局）
- Test: `src/server/services/posts.test.ts`（追加列表可见性用例）

**Interfaces:**
- Consumes: Task 3 的 `requireUser`；Task 5 的 `listPosts`
- Produces: `src/app/admin/layout.tsx` —— Server Component，调用 `requireUser()`；未登录 → `redirect('/login')`；加载 `AdminNav` + 内容区。

- [ ] **Step 1: 写失败测试**（追加到 `src/server/services/posts.test.ts`）

```ts
  it('hides other authors drafts from a plain author', async () => {
    const cat = await createCategory({ parentId: null, slug: 'guide', name: '指南' })
    const mine = await createPost({ actor: author, categoryId: cat.id, title: 'mine', bodyMd: 'x' })
    const other = { kind: 'user', id: 'someone-else', role: 'author' } as const
    const theirs = await createPost({ actor: other, categoryId: cat.id, title: 'theirs', bodyMd: 'y' })
    const visible = await listPosts({ actor: author, status: 'draft' })
    const ids = visible.items.map(i => i.id)
    expect(ids).toContain(mine.id)
    expect(ids).not.toContain(theirs.id)
  })
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run src/server/services/posts.test.ts -t 'hides other authors'`
Expected: FAIL —— 可见性过滤未实现

- [ ] **Step 3: 实现**
- 追加上面那个可见性用例时，**同步在 `src/server/services/posts.test.ts` 的 import 里补上 `listPosts`**。

- `admin/layout.tsx`：`const user = await requireUser()`；渲染左侧 `AdminNav`（文章 / 分类 / 标签 / 媒体 / 团队 / Token / 审计 / 设置，**团队、Token、审计、设置仅 admin 可见**）+ 右侧内容区。
- `admin/page.tsx`：仪表盘——草稿箱（本人草稿，20 条）、最近活动（最近 20 条审计日志，admin 可见时显示全部，否则显示自己的）、文章总数与今日新增。
- `admin/posts/page.tsx`：列表，支持 `?status=`、`?category=`、`?author=`、`?tag=` 过滤，分页 20；列为标题、状态、分类、作者、更新时间、浏览量、操作。
- `PostTable.tsx`：纯展示 + 链接到 `/admin/posts/[id]`。

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm vitest run src/server/services/posts.test.ts`
Expected: PASS —— 全部测试通过

- [ ] **Step 5: 提交**

```bash
git add src/app/admin src/components/admin
git commit -m "feat(admin): shell, dashboard and post list"
```

---

### Task 13: 编辑器（frontmatter 表单 + Markdown + 预览 + 版本历史）

**Files:**
- Create: `src/app/admin/posts/new/page.tsx`, `src/app/admin/posts/[id]/page.tsx`, `src/components/admin/MarkdownEditor.tsx`, `src/components/admin/RevisionList.tsx`, `src/app/admin/posts/actions.ts`
- Test: `src/server/services/revisions.test.ts`

**Interfaces:**
- Consumes: Task 5 的 `createPost` / `updatePost` / `getPostById`；Task 8 的 `renderMarkdown`；Task 6 的 `listTags`
- Produces:
  - `src/server/services/revisions.ts`：`listRevisions(postId: string): Promise<Revision[]>`、`restoreRevision(input: { actor: Actor; postId: string; revisionId: string }): Promise<Post>` —— **只恢复 title / summary / bodyMd**，tags / category / status 保持当前值；恢复动作写一条新的 revision + 一条审计日志。
  - `src/app/admin/posts/actions.ts`：Server Actions —— `savePostAction(formData): Promise<Result>`、`publishAction(id)`、`unpublishAction(id)`、`archiveAction(id)`、`restoreRevisionAction(postId, revisionId)`、`previewMarkdownAction(md): Promise<{ html: string; toc: TocEntry[] }>`
  - `type Revision = { id: string; postId: string; title: string; summary: string | null; bodyMd: string; authorId: string; source: 'human' | 'agent'; createdAt: Date }`

- [ ] **Step 1: 写失败测试**

`src/server/services/revisions.test.ts`：

```ts
import { describe, expect, it, beforeEach } from 'vitest'
import { resetDb } from '../../../tests/db'
import { createCategory } from './categories'
import { createPost, updatePost, getPostById } from './posts'
import { listRevisions, restoreRevision } from './revisions'

let actor: { kind: 'user'; id: string; role: 'admin' } = { kind: 'user', id: '', role: 'admin' }

describe('revisions', () => {
  beforeEach(async () => {
    await resetDb()
    const { db } = await import('../db/client')
    const { users } = await import('../db/schema')
    actor.id = (await db.query.users.findFirst())!.id
  })

  it('snapshots content changes only', async () => {
    const cat = await createCategory({ parentId: null, slug: 'guide', name: '指南' })
    const post = await createPost({ actor, categoryId: cat.id, title: 'A', bodyMd: 'x' })
    await updatePost({ actor, id: post.id, bodyMd: 'y' })
    await updatePost({ actor, id: post.id, title: 'B' })
    const revs = await listRevisions(post.id)
    expect(revs).toHaveLength(2)
    expect(revs[0]?.bodyMd).toBe('x')
  })

  it('restores content but keeps tags and status', async () => {
    const cat = await createCategory({ parentId: null, slug: 'guide', name: '指南' })
    const post = await createPost({ actor, categoryId: cat.id, title: 'A', bodyMd: 'v1', tags: ['mcp'] })
    await updatePost({ actor, id: post.id, bodyMd: 'v2' })
    const rev = (await listRevisions(post.id))[0]!
    await restoreRevision({ actor, postId: post.id, revisionId: rev.id })
    const after = await getPostById(post.id)
    expect(after?.bodyMd).toBe('v1')
    expect(after?.status).toBe('draft')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run src/server/services/revisions.test.ts`
Expected: FAIL —— `Cannot find module './revisions'`

- [ ] **Step 3: 实现**

- `revisions.ts`：`listRevisions` 按 `createdAt` 倒序；`restoreRevision` 取 revision 的三个内容字段调 `updatePost`（**不带 `expectedUpdatedAt`**，回滚是显式意图），写审计日志 `revision.restore`。
- `MarkdownEditor.tsx`：客户端组件，两栏（左 textarea / 右预览）。
  - 顶部 frontmatter 表单：标题、摘要、分类（下拉，只列叶子分类）、标签（多选，可新建）、封面图（从媒体库选）。
  - 预览：以 debounce **500ms** 调 `previewMarkdownAction` 拿 HTML（**复用服务端渲染器**，不在客户端引入 Shiki）。
  - 保存：调 `savePostAction`；成功后 `router.refresh()`；冲突（409）时显示「文章已被他人修改」并提供重新加载按钮。
- `actions.ts`：所有 action 先 `requireUser()`，再调 service，错误按 `DomainError.code` 映射成 `{ ok: false, message, details }` 返回（**不抛原始异常给客户端**）。
- `RevisionList.tsx`：显示历史版本的时间、作者、来源（human/agent）、字数；提供「恢复此版本」按钮（调 `restoreRevisionAction`）。

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm vitest run src/server/services/revisions.test.ts`
Expected: PASS —— 2 个测试通过

- [ ] **Step 5: 提交**

```bash
git add src/server/services/revisions.ts src/app/admin/posts src/components/admin
git commit -m "feat(admin): markdown editor with live preview and revision restore"
```

---

### Task 14: 后台管理页（分类树、标签、媒体、团队、Token、审计、设置）

**Files:**
- Create: `src/app/admin/categories/page.tsx`, `src/app/admin/tags/page.tsx`, `src/app/admin/media/page.tsx`, `src/app/admin/team/page.tsx`, `src/app/admin/tokens/page.tsx`, `src/app/admin/audit/page.tsx`, `src/app/admin/settings/page.tsx`
- Create: `src/components/admin/CategoryTreeEditor.tsx`, `src/components/admin/MediaPicker.tsx`, `src/components/admin/TokenList.tsx`
- Create: `src/app/admin/actions.ts`（admin 专属 Server Actions）
- Test: `src/server/services/admin.test.ts`

**Interfaces:**
- Consumes: Task 4 / 6 的 service；Task 2 的 `mcpTokens`、`users`、`auditLogs`、`siteSettings`
- Produces:
  - `src/app/admin/actions.ts`：
    - `createCategoryAction(formData)`、`renameCategoryAction(formData)`、`moveCategoryAction(formData)`、`deleteCategoryAction(formData)` —— **admin only**
    - `createTokenAction(formData): Promise<{ ok: boolean; token?: string; message: string }>` —— **admin only**；明文 token **只在这一次响应里返回**，库里存 `sha256`；新 token `canPublish` 默认 `false`，表单可勾选
    - `revokeTokenAction(id)` —— admin only
    - `createUserAction(formData)`、`setUserRoleAction(formData)` —— admin only
    - `updateSettingsAction(formData)` —— admin only；写 `siteSettings`（键：`siteName`、`siteDescription`、`siteUrl`、`rssTitle`）
  - `src/components/admin/MediaPicker.tsx`：多选上传，调用 Server Action `uploadMediaAction(formData)`（在 `src/app/admin/actions.ts`），返回 URL 列表，可插入 Markdown。
  - `src/components/admin/TokenList.tsx`：显示 token 名、归属作者、`can_publish`、最后使用时间、创建时间；明文只在签发后显示一次（弹窗 + 「我已保存」确认后才可关闭）。

- [ ] **Step 1: 写失败测试**

`src/server/services/admin.test.ts`：

```ts
import { describe, expect, it, beforeEach } from 'vitest'
import { resetDb } from '../../../tests/db'
import { db } from '../db/client'
import { mcpTokens } from '../db/schema'
import { createMcpToken } from './tokens'

let admin: { kind: 'user'; id: string; role: 'admin' } = { kind: 'user', id: '', role: 'admin' }

describe('mcp tokens', () => {
  beforeEach(async () => {
    await resetDb()
    admin.id = (await db.query.users.findFirst())!.id
  })

  it('defaults canPublish to false and returns the plaintext once', async () => {
    const out = await createMcpToken({ actor: admin, name: 'claude-code', canPublish: false })
    expect(out.token).toMatch(/^[A-Za-z0-9_-]{40,}$/)
    const row = (await db.select().from(mcpTokens))[0]!
    expect(row.canPublish).toBe(false)
    expect(row.tokenHash).not.toBe(out.token)
    expect(row.tokenHash).toHaveLength(64)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run src/server/services/admin.test.ts`
Expected: FAIL —— `Cannot find module './tokens'`

- [ ] **Step 3: 实现**

- 新建 `src/server/services/tokens.ts`：`createMcpToken(input: { actor: Actor; name: string; canPublish: boolean }): Promise<{ id: string; token: string }>` —— 生成 32 字节 base64url 明文，存 `sha256(token)`；`revokeToken(id)` 设 `revokedAt`；`verifyMcpToken(token: string): Promise<{ id: string; authorId: string; role: 'admin'|'author'; canPublish: boolean } | null>` —— 查 `sha256(token)` 且 `revokedAt IS NULL`。
- `admin/actions.ts` 里每个 action 先 `requireUser()` 再检查 `role === 'admin'`，否则返回 `{ ok: false, message: '仅管理员可执行此操作' }`。
- 页面：
  - `categories/page.tsx` —— `CategoryTreeEditor`：展示树，支持新建（选父分类）、改名（显示名 / slug）、移动（下拉选新父分类）、删除（非空时禁用并显示待迁移文章数）。
  - `tags/page.tsx` —— 标签表格，支持重命名、合并（选源 → 目标）。
  - `media/page.tsx` —— 媒体网格，支持上传与删除。
  - `team/page.tsx` —— 成员表格，新增成员、改角色、停用。
  - `tokens/page.tsx` —— Token 表格 + 签发表单 + 吊销按钮。
  - `audit/page.tsx` —— 审计日志表格（时间、actor 类型与名字、action、目标），支持按 action 过滤。
  - `settings/page.tsx` —— 站点设置表单。

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm vitest run src/server/services/admin.test.ts`
Expected: PASS —— 1 个测试通过

- [ ] **Step 5: 提交**

```bash
git add src/app/admin src/components/admin src/server/services/tokens.ts
git commit -m "feat(admin): category tree, tags, media, team, tokens, audit and settings"
```

---

# Phase 4 — MCP 服务

### Task 15: MCP 服务器与工具集

**Files:**
- Create: `src/mcp/server.ts`, `src/mcp/tools.ts`, `src/mcp/context.ts`, `src/app/api/mcp/route.ts`
- Test: `src/mcp/tools.test.ts`

**Interfaces:**
- Consumes: Task 3 / 4 / 5 / 6 / 14 的全部 service；`verifyMcpToken`
- Produces:
  - `src/mcp/context.ts`：
    ```ts
    export type McpContext = { actor: Actor; tokenId: string }
    ```
  - `src/mcp/tools.ts`：
    ```ts
    export function registerTools(server: McpServer, ctx: McpContext): void
    ```
    注册以下工具（名称逐字照抄，每个工具的参数用 Zod schema 描述）：
    读：`list_categories` `list_tags` `list_posts` `get_post` `search_posts` `list_media` `list_revisions`
    写：`create_post` `update_post` `publish_post` `unpublish_post` `archive_post` `create_tag` `rename_tag` `merge_tags` `delete_media` `restore_revision` `upload_image` `create_category` `rename_category` `move_category` `delete_category`
    **不注册**：成员、Token、站点设置、审计日志相关工具。
    **不注册 `delete_post`**（软删除走 `archive_post`）。
  - `src/app/api/mcp/route.ts`：`POST` / `GET`；`Authorization: Bearer <token>` 缺失 → 401；token 吊销或不存在 → 401；用 `@modelcontextprotocol/sdk` 的 `StreamableHTTPServerTransport`；每次请求用 `ctx` 重新组装 server（per-request session）。

- [ ] **Step 1: 写失败测试**（含 Review Focus #3）

`src/mcp/tools.test.ts`：

```ts
import { describe, expect, it, beforeEach } from 'vitest'
import { resetDb } from '../../tests/db'
import { db } from '../server/db/client'
import { mcpTokens } from '../server/db/schema'
import { createMcpToken } from '../server/services/tokens'
import { verifyMcpToken } from '../server/services/tokens'
import { createCategory } from '../server/services/categories'

describe('mcp token verification', () => {
  beforeEach(async () => { await resetDb() })

  it('rejects a revoked token', async () => {
    const admin: { kind: 'user'; id: string; role: 'admin' } = { kind: 'user', id: '', role: 'admin' }
    admin.id = (await db.query.users.findFirst())!.id
    const { token } = await createMcpToken({ actor: admin, name: 'x', canPublish: true })
    expect(await verifyMcpToken(token)).not.toBeNull()
    await db.update(mcpTokens).set({ revokedAt: new Date() })
    expect(await verifyMcpToken(token)).toBeNull()
  })

  it('rejects an unknown token', async () => {
    expect(await verifyMcpToken('not-a-real-token')).toBeNull()
  })
})
```

另加一个工具层用例：调用 `create_post` 时分类不存在 → 返回的错误文案里**列出可用分类**。

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run src/mcp/tools.test.ts`
Expected: FAIL —— `Cannot find module '../server/services/tokens'`

- [ ] **Step 3: 实现**

- `src/server/services/tokens.ts` 的 `verifyMcpToken`：**先查 `revokedAt IS NULL`**，命中才返回；否则返回 `null`（**吊销后即使哈希对也必须失效**）。
- `src/mcp/tools.ts`：每个工具的 handler 形如：
  ```ts
  server.registerTool('create_post', {
    description: '创建一篇草稿。必须指定已存在的分类；新标签会被自动创建。',
    inputSchema: { categoryId: z.string(), title: z.string(), bodyMd: z.string(), summary: z.string().optional(), slug: z.string().optional(), tags: z.array(z.string()).optional() },
  }, async ({ categoryId, title, bodyMd, summary, slug, tags }) => {
    const post = await createPost({ actor: ctx.actor, categoryId, title, bodyMd, summary, slug, tags })
    return { content: [{ type: 'text', text: JSON.stringify({ id: post.id, slug: post.slug, status: post.status }) }] }
  })
  ```
  - **错误映射**：捕获 `DomainError` → 返回 `{ isError: true, content: [{ type: 'text', text: message + (details ? '\n' + JSON.stringify(details) : '') }] }`。分类不存在时，`createPost` 抛的 `DomainError` 的 `details` 必须含 `availableCategories: [{ id, path, name }]`——**错误里要列出可用分类**，这是规格的硬要求。
  - `create_post` / `update_post` 的 schema **不含 `status`**（Zod 默认 strip 未声明字段，但要用 `.strict()` 显式拒绝，避免误以为生效）。
  - `publish_post` / `unpublish_post` 的 handler 先检查 `ctx.actor.kind === 'token' && !ctx.actor.canPublish` → 抛 `DomainError('forbidden', '该 Token 没有发布权限')`。
  - `create_category` 的 schema **必填 `slug`**（`z.string()`，无 `.optional()`）。
  - `upload_image` 的入参用 MCP content block：接收 `{ mimeType, data }`（base64），走 `uploadMedia`。
- `src/app/api/mcp/route.ts`：
  ```ts
  export async function POST(req: Request) {
    const auth = req.headers.get('authorization')
    if (!auth?.startsWith('Bearer ')) return new Response('Unauthorized', { status: 401 })
    const token = auth.slice(7)
    const verified = await verifyMcpToken(token)
    if (!verified) return new Response('Unauthorized', { status: 401 })
    const ctx: McpContext = { actor: { kind: 'token', id: verified.id, authorId: verified.authorId, role: verified.role, canPublish: verified.canPublish }, tokenId: verified.id }
    // 用 StreamableHTTPServerTransport 组装 server 并 handleRequest
  }
  ```
  `GET` 同样需要鉴权，处理 SSE 流。
  - 每次鉴权成功后更新 `mcp_tokens.last_used_at`（`new Date()`），让后台的「最后使用时间」列有真实数据。

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm vitest run src/mcp/tools.test.ts`
Expected: PASS —— 3 个测试通过

- [ ] **Step 5: 提交**

```bash
git add src/mcp src/app/api/mcp src/server/services/tokens.ts
git commit -m "feat(mcp): streamable http server with the full tool set"
```

---

### Task 16: stdio 桥接脚本

**Files:**
- Create: `mcp/stdio-bridge.mjs`
- Test: `src/mcp/stdio-bridge.test.ts`

**Interfaces:**
- Consumes: Task 15 的 `POST /api/mcp`
- Produces: `mcp/stdio-bridge.mjs` —— 读 stdin 的 JSON-RPC 行，转发到 `MCP_HTTP_URL`（默认 `http://localhost:3000/api/mcp`），带上 `Authorization: Bearer ${MCP_TOKEN}`，把响应体原样写回 stdout。**必须逐行处理**（不能把整个 stdin 读完再发），否则 MCP 的 initialize 握手会卡住。

- [ ] **Step 1: 写失败测试**

`src/mcp/stdio-bridge.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

describe('stdio bridge', () => {
  it('reads the endpoint and token from env and forwards bearer auth', () => {
    const src = readFileSync(new URL('../../mcp/stdio-bridge.mjs', import.meta.url), 'utf8')
    expect(src).toContain('MCP_HTTP_URL')
    expect(src).toContain('MCP_TOKEN')
    expect(src).toContain('Bearer')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run src/mcp/stdio-bridge.test.ts`
Expected: FAIL —— 文件不存在

- [ ] **Step 3: 实现**

- `mcp/stdio-bridge.mjs`（纯 Node，无依赖）：
  - `const url = process.env.MCP_HTTP_URL ?? 'http://localhost:3000/api/mcp'`
  - `const token = process.env.MCP_TOKEN`；缺失则向 stderr 打印一行明确错误并 `process.exit(1)`。
  - 用 `readline` 逐行读 stdin；每行 trim 后非空才处理；`fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', authorization: \`Bearer ${token}\`, accept: 'application/json, text/event-stream' }, body: line })`；把 `res.text()` 原样写到 stdout 并换行。
  - **透传 `mcp-session-id` 响应头**：把响应的 `mcp-session-id` 存起来，后续请求带回 `mcp-session-id` 请求头。
  - 出错时把错误写 stderr，**不要污染 stdout**（stdout 是 JSON-RPC 通道）。

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm vitest run src/mcp/stdio-bridge.test.ts`
Expected: PASS —— 1 个测试通过

- [ ] **Step 5: 提交**

```bash
git add mcp/stdio-bridge.mjs src/mcp/stdio-bridge.test.ts
git commit -m "feat(mcp): stdio to http bridge for local agents"
```

---

# Phase 5 — 交付与运维

### Task 17: Docker 镜像与 Compose

**Files:**
- Create: `Dockerfile`, `.dockerignore`, `docker-compose.yml`
- Modify: `package.json`（加 `start:standalone` 脚本）

**Interfaces:**
- Consumes: 全部任务的产物
- Produces:
  - `Dockerfile`：三阶段 `deps` → `builder` → `runner`；runner 用 **`node:24-slim`**；非 root 用户；`EXPOSE 3000`；`CMD ["node", "server.js"]`（standalone 输出）。
  - `docker-compose.yml`：`db`（postgres:17-alpine，卷 `pgdata`，健康检查 `pg_isready`）、`migrate`（一次性服务，跑 `pnpm drizzle-kit migrate` 后退出）、`app`（depends_on `migrate` `service_completed_successfully` 与 `db` `service_healthy`；卷 `uploads:/app/uploads`；端口 `3000:3000`）。

- [ ] **Step 1: 写失败测试**（用脚本断言 compose 结构）

`tests/docker.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

describe('docker packaging', () => {
  it('uses node:24-slim and runs as non-root', () => {
    const df = readFileSync('Dockerfile', 'utf8')
    expect(df).toContain('node:24-slim')
    expect(df).not.toContain('node:24-alpine')
    expect(df).toContain('USER nextjs')
  })

  it('compose defines db, migrate and app with the uploads volume', () => {
    const c = readFileSync('docker-compose.yml', 'utf8')
    expect(c).toContain('postgres:17-alpine')
    expect(c).toContain('pgdata')
    expect(c).toContain('uploads:/app/uploads')
    expect(c).toContain('service_completed_successfully')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run tests/docker.test.ts`
Expected: FAIL —— 文件不存在

- [ ] **Step 3: 实现**

- `Dockerfile`：
  ```dockerfile
  FROM node:24-slim AS deps
  WORKDIR /app
  RUN corepack enable
  COPY package.json pnpm-lock.yaml ./
  RUN pnpm install --frozen-lockfile

  FROM node:24-slim AS builder
  WORKDIR /app
  RUN corepack enable
  COPY --from=deps /app/node_modules ./node_modules
  COPY . .
  ENV NEXT_TELEMETRY_DISABLED=1
  RUN pnpm build

  FROM node:24-slim AS runner
  WORKDIR /app
  ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
  RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs nextjs
  COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
  COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
  COPY --from=builder --chown=nextjs:nodejs /app/public ./public
  COPY --from=builder --chown=nextjs:nodejs /app/drizzle ./drizzle
  COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.bin/drizzle-kit ./node_modules/.bin/drizzle-kit
  USER nextjs
  EXPOSE 3000
  ENV PORT=3000 HOSTNAME=0.0.0.0
  CMD ["node", "server.js"]
  ```
- `docker-compose.yml`：三个服务如上；`app` 的 env 从 `.env` 读（`DATABASE_URL` 指向 `db:5432`）；`uploads` 卷挂到 `/app/uploads`。
- `.dockerignore`：`node_modules` `.next` `.git` `docs` `*.md`。
- `.env.example`：列出 Global Constraints 里全部环境变量名与占位值。

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm vitest run tests/docker.test.ts`
Expected: PASS —— 2 个测试通过

再跑一次真实构建验证：

Run: `docker compose build && docker compose up -d && sleep 8 && curl -fsS http://localhost:3000/ > /dev/null && curl -fsS -X POST http://localhost:3000/api/mcp -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' | head -c 200`
Expected: 网站返回 200；MCP 返回 JSON-RPC 响应（未带 token 时应为 401——两种结果都算通过，取决于是否带了 token）

- [ ] **Step 5: 提交**

```bash
git add Dockerfile .dockerignore docker-compose.yml .env.example package.json tests/docker.test.ts
git commit -m "chore(docker): multi-stage image and compose stack with migrate job"
```

---

### Task 18: README、运维文档与端到端验收

**Files:**
- Modify: `README.md`
- Create: `docs/operations.md`
- Test: `tests/e2e.test.ts`

**Interfaces:**
- Consumes: 全部任务
- Produces: `README.md`（快速开始 + MCP 接入配置 + 项目结构说明）、`docs/operations.md`（备份、恢复、升级、Token 轮换）

- [ ] **Step 1: 写失败测试**

`tests/e2e.test.ts`：

```ts
import { describe, expect, it, beforeEach } from 'vitest'
import { resetDb } from './db'
import { db } from '../src/server/db/client'
import { createCategory } from '../src/server/services/categories'
import { createPost, publishPost } from '../src/server/services/posts'
import { createTag } from '../src/server/services/tags'
import { recordAudit } from '../src/server/audit'
import { auditLogs } from '../src/server/db/schema'

describe('end to end over services', () => {
  beforeEach(async () => { await resetDb() })

  it('publishes a post and records the audit trail', async () => {
    const actor = { kind: 'user', id: (await db.query.users.findFirst())!.id, role: 'admin' } as const
    const cat = await createCategory({ parentId: null, slug: 'guide', name: '指南' })
    const tag = await createTag('MCP')
    const post = await createPost({ actor, categoryId: cat.id, title: '标题', bodyMd: '正文', tags: ['mcp'] })
    await recordAudit({ actor, action: 'post.create', target: { type: 'post', id: post.id } })
    await publishPost({ actor, id: post.id })
    expect((await db.select().from(auditLogs)).length).toBeGreaterThan(0)
    expect(tag.slug).toBe('mcp')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run tests/e2e.test.ts`
Expected: FAIL —— 缺少 `recordAudit` 或其他未实现件

- [ ] **Step 3: 实现**

`README.md` 必须包含：
- **快速开始**：`cp .env.example .env` → 填 `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD` → `docker compose up -d` → 打开 `http://localhost:3000`。
- **MCP 接入**：在 `/admin/tokens` 签发 Token（默认无发布权）→ 复制 `mcp/stdio-bridge.mjs` 的绝对路径 → 写 `claude mcp add` 配置示例（含 `MCP_HTTP_URL` 与 `MCP_TOKEN`）→ 列出全部 22 个工具名与各自的参数要点，特别是「`create_post` 的分类必须是已存在的分类，错误信息会列出可用分类」。
- **本地开发**：`pnpm install` → 起 `docker compose -f docker-compose.test.yml up -d` → `pnpm db:migrate` → `pnpm dev` → `pnpm test`。
- **项目结构**：贴 `docs/superpowers/specs/2026-10-29-terra-wiki-design.md` 的 §10 目录树。
- **安全说明**：Markdown 不解析原始 HTML；SVG 不允许上传；上传按 magic bytes 校验；Token 只存 sha256；Token 吊销即刻失效。

`docs/operations.md`：备份（`docker compose exec -T db pg_dump -U terra terra > backup.sql`）、恢复、升级顺序（`docker compose pull && docker compose up -d --build`）、Token 轮换步骤、常见故障（迁移未跑、端口占用、上传目录权限）。

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm vitest run tests/e2e.test.ts && pnpm typecheck && pnpm test && pnpm build`
Expected: 全部通过，无 TypeScript 错误，构建成功

- [ ] **Step 5: 提交**

```bash
git add README.md docs/operations.md tests/e2e.test.ts
git commit -m "docs: quick start, mcp setup and operations guide"
```

---

## 收尾验收（全部任务完成后）

逐条对照规格 §11：

- [ ] `pnpm typecheck` 无错误；`pnpm test` 全绿；`pnpm build` 成功
- [ ] `docker compose up` 后网站、后台、MCP 端点均可用
- [ ] 用签发的 Token 通过 stdio 桥接从 Claude Code 调 `list_posts` 成功
- [ ] 用 Token 调 `create_post`（分类不存在）→ 错误里列出了可用分类
- [ ] 用 Token 调 `create_post` → 草稿出现在后台草稿箱，审计日志 actor = token 名
- [ ] 勾选 `can_publish` 后 `publish_post` 成功；未勾选时被拒
- [ ] 暗色模式下代码块切到深色主题，页面无浅色残留
- [ ] 移动端 375px 宽下代码块横向滚动，不撑破布局
- [ ] 分类改名 / 移动后，旧 URL 301 到新 URL（**含孙级**）
- [ ] 同一访客同一天重复访问文章，浏览量只 +1
- [ ] 上传伪装成 `.png` 的 SVG 被拒
- [ ] 切换语言后界面文案变化而 URL 不变
