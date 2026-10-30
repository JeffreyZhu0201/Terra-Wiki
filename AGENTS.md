# Terra-Wiki 开发规范

面向程序员的技术文档站。Next.js (App Router) + React 19 + Tailwind v4 + Drizzle + PostgreSQL，界面中英双语，含 MCP 接入。

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## 开发流程

```bash
docker compose -f docker-compose.dev.yml up -d   # 开发库 :5432 + 测试库 :55432
npm run dev                                      # http://localhost:3000
```

- 配置全部在 `.env`（模板见 `.env.example`），compose 与 next dev 都自动读取。
- 正式环境是另一条链路：`docker compose build app && docker compose up -d app`。镜像在构建时打入源码，**改完代码必须重建镜像**才会在 :3000 生效。
- 完成的定义：`npm run typecheck` 与 `npm test` 全过。测试连 `TEST_DATABASE_URL`（55432 测试库）。
- 已知坑：本机装了 OrbStack，它会把容器端口自动转发到 localhost。若迁移「成功但没建表」，先确认 `localhost:5432` 实际落在哪个容器（`docker exec <db容器> psql -U terra -d terra -c '\dt'`）。

## 架构分层（接口规范）

请求链路固定三层，职责不许越界：

```
route.ts / actions.ts   只做：解析参数（zod）→ 调 service → 把 DomainError 映射成响应
src/server/services/*   业务规则、校验、slug/时间生成。只抛 DomainError，不碰 HTTP
src/server/db/*         Drizzle schema 与 client，所有 SQL 经 Drizzle
```

- 业务错误统一 `DomainError`（`src/server/errors.ts`），code 取 `not_found | conflict | forbidden | invalid | unauthorized`。service 层不写 `throw new Error`。
- HTTP 层响应统一形状：`{ ok: boolean, message?: string, ...数据 }`，错误码用真实 HTTP status。不要散落自定义错误结构。
- 写接口优先 Server Actions（`actions.ts`），Route Handler 只保留四类：`api/auth/*`（登录登出）、`api/mcp`（MCP 端点）、`api/track`（浏览量打点）。新增公开 API 前先考虑 Server Action 是否够用。
- MCP 工具（`src/mcp/tools.ts`）与后台界面必须把同一个 DomainError 映射成同一段文案——文案定义一处，两边复用。
- 首次登录自举初始管理员（`bootstrapAdmin`），依赖 `.env` 的 `BOOTSTRAP_ADMIN_*`。

## 前端效果

设计语言：「工程手册」——浅色纸面、普鲁士蓝强调、衬线中文标题、深色代码窗格。细节以 `globals.css` 为唯一事实源。

- 主题变量全部定义在 `globals.css` 的 `@theme` 块。**禁用 `@theme inline`**：它会把颜色内联进工具类、不输出 CSS 变量，导致 `.dark` 覆盖失效（主题切换曾因此整个失灵）。
- 深色模式：`next-themes`（`attribute="class"`）往 `<html>` 加 `.dark`，深色值只写在 `.dark { }` 的变量覆盖里。新颜色必须同时给浅色和深色两套值，用 `text-ink`、`bg-paper` 这类语义类，不写裸色值。
- 深色不是把浅色反色：代码窗格（`.code-pane`）两种模式下都比页面底色更深；Shiki 双主题靠 `--shiki-light/dark` 切换。
- 组件默认 Server Component；`'use client'` 只给真需要交互的小件（ThemeToggle、CodeCopyEnabler 这类）。通用原语放 `components/ui/`，页面布局件放 `components/layout/`，文章内件放 `components/article/`。
- 界面文案一律走 `src/i18n/dictionaries/{zh,en}.ts`，组件里不写死中英文。服务端用 `getLocale()`，客户端组件从 `src/i18n/locale` 取常量与类型。
- 正文样式集中在 `.prose`：列宽 68ch、衬线标题、行高 1.75。改排版只动 `globals.css`，不在组件里散写样式。

## 目录结构

```
src/app/
  (public)/            公开页面：[...segments] 文章页（经 server/routes/resolve.ts 解析路径）、search、tags、sitemap
  admin/               后台各页面 + actions.ts（Server Actions 在各页面目录内）
  api/                 仅 auth、mcp、track 四个 Route Handler
  login/  rss.xml  uploads/[...path]/    登录页、RSS、上传文件读取
src/components/        layout/（TopBar 等）、article/、admin/、auth/、ui/（button、input 原语）
src/server/
  services/            每个领域一个文件（posts、tags、categories…），配同名 .test.ts
  db/                  schema.ts + client.ts
  auth/  markdown/  routes/  storage/   会话、Shiki 渲染、路径解析、上传存储
  errors.ts            DomainError，全站唯一业务错误类型
src/i18n/              locale 常量 + dictionaries/{zh,en}.ts
src/mcp/               MCP 工具定义；mcp/stdio-bridge.mjs 是 stdio 桥接脚本
drizzle/               迁移 SQL（drizzle-kit generate 生成，不手写）
scripts/seed.sql       演示数据
```

放置约定：新页面先想清楚进 `(public)` 还是 `admin/`；新业务逻辑进 `server/services/` 对应领域文件（没有就新建一个）；纯函数工具进 `src/lib/`。
