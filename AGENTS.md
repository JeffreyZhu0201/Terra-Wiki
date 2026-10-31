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
pnpm dev                                         # http://localhost:3000
```

- 配置全部在 `.env`（模板见 `.env.example`），compose 与 next dev 都自动读取。
- 正式环境走 CI 出的镜像：在 main 上打 `v<version>` tag 后，`.github/workflows/release-image.yml` 自动构建并推送 `ghcr.io/jeffreyzhu0201/terra-wiki:release-<version>`，服务器端 `docker compose pull app && docker compose up -d`。镜像在构建时打入源码，**必须拉新镜像**改动才会在 :3000 生效；数据库迁移在 app 容器启动时自动跑（`scripts/migrate.mjs`），没有独立的 migrate 镜像。
- 完成的定义：`pnpm typecheck` 与 `pnpm test` 全过。测试连 `TEST_DATABASE_URL`（55432 测试库）。包管理器固定 pnpm（`packageManager` 字段已锁版本），不要用 npm / yarn。
- 已知坑：本机装了 OrbStack，它会把容器端口自动转发到 localhost。若迁移「成功但没建表」，先确认 `localhost:5432` 实际落在哪个容器（`docker exec <db容器> psql -U terra -d terra -c '\dt'`）。

## 分支模型与工作流

gitflow 三段式。完整操作手册见 `docs/branching.md`，本节是同一套规则的浓缩。

| 分支 | 作用 | 谁往里合 |
| --- | --- | --- |
| `main` | 生产分支，每个提交都对应线上可运行的状态 | 只接受 `release/*` 与 `hotfix/*` |
| `develop` | 集成分支，日常合并的目标 | `feature/*` `bugfix/*` `chore/*` `release/*` `hotfix/*` |
| `feature/<name>` | 新功能、新页面、新 MCP 工具 | 从 `develop` 切出，合回 `develop` |
| `bugfix/<name>` | 缺陷修复，流程同 feature | 从 `develop` 切出，合回 `develop` |
| `chore/<name>` | 依赖升级、构建配置、文档 | 从 `develop` 切出，合回 `develop` |
| `release/<version>` | 发布准备，只放发布前的修补 | 合回 `develop`（回灌）与 `main`（发布） |
| `hotfix/<version>` | 线上紧急修复，从 `main` 切出 | 合回 `main`（发布）与 `develop`（回灌） |

两条铁律：**功能分支一律从 `develop` 切出、合回 `develop`；只有 `release/*` 与 `hotfix/*` 能进 `main`。**

- 命名：`<type>/<short-kebab-description>`，type ∈ {feature, bugfix, chore, release, hotfix}，描述小写短横线、不用中文。release/hotfix 后半段是版本号，不带 `v`：`release/0.2.0`。历史上的 `feat/terra-wiki` 已合入 main，保留不改名，新分支一律用上面的前缀。
- 日常流程：`git switch develop && git switch -c feature/<name>` → 开发 → 自测 → 提交 → PR 到 `develop` → CI 绿 + review 通过 → 合并 → 删分支。
- 提交规范：Conventional Commits `<type>(<scope>): <subject>`，scope 取模块名（`auth` `posts` `categories` `tags` `media` `mcp` `admin` `public` `services` `db` `docker` `ui` `markdown` `uploads` `users`），**一次提交只做一件事**，破坏性变更在 body 写 `BREAKING CHANGE:`。
- PR 清单：关联 issue、typecheck + test 全过（即上面的「完成的定义」）、有迁移则附上 `drizzle/` 下新增的 SQL 文件、无破坏性变更或写明回滚方式。模板见 `.github/pull_request_template.md`。
- 合并规则：`main` 与 `develop` 只接受 `--no-ff` 合并，保留发布边界节点；不 force push，不直接 push 到 `main` / `develop`。
- 发布与热修：版本号语义化（`MAJOR.MINOR.PATCH`，与 `package.json` 的 `version` 一致），发布分支合回 develop 与 main 后在 main 上打 `v<version>` tag；热修从 `main` 切出，修完同时合回 `main` 与 `develop`。步骤细节见 `docs/branching.md`。
- 保护规则：main 与 develop 都要求走 PR、CI 必须通过、禁止 force push、合并后删源分支。规则本身在 GitHub 设置里配，落地命令见 `docs/branching.md` 末节。
- CI：`.github/workflows/ci.yml` 在 push 到 main/develop 与 PR 时跑 `pnpm typecheck` + `pnpm test`（Postgres 17 起在 55432），与「完成的定义」一致；仓库没有 linter，别在 CI 里加 lint 步骤。

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

设计语言：「工程手册」——浅色纸面、普鲁士蓝强调、衬线中文标题、随主题切换配色的代码窗格。细节以 `globals.css` 为唯一事实源。

- 主题变量全部定义在 `globals.css` 的 `@theme` 块。**禁用 `@theme inline`**：它会把颜色内联进工具类、不输出 CSS 变量，导致 `.dark` 覆盖失效（主题切换曾因此整个失灵）。
- 深色模式：`next-themes`（`attribute="class"`）往 `<html>` 加 `.dark`，深色值只写在 `.dark { }` 的变量覆盖里。新颜色必须同时给浅色和深色两套值，用 `text-ink`、`bg-paper` 这类语义类，不写裸色值。
- 深色不是把浅色反色：代码窗格（`.code-pane`）的底色、标题栏、复制按钮配色全部走 `--color-code-*` 变量，亮色模式浅底深字、暗色模式深底浅字；Shiki 双主题靠 `--shiki-light/dark` 切换，文字色必须与窗格底色同明暗，不许深字压深底。
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
src/mcp/               MCP 工具定义（tools.ts）+ instructions.ts（随 initialize 下发给 Agent 的写入契约）
drizzle/               迁移 SQL（drizzle-kit generate 生成，不手写）
scripts/seed.sql       演示数据；scripts/migrate.mjs 是容器启动时自动迁移用的脚本
```

放置约定：新页面先想清楚进 `(public)` 还是 `admin/`；新业务逻辑进 `server/services/` 对应领域文件（没有就新建一个）；纯函数工具进 `src/lib/`。
