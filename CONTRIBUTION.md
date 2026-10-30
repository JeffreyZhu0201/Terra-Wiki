<div align="center">

# 🤝 贡献指南

**欢迎给 Terra-Wiki 提 PR。** 这份文档说明从分支到合并的完整流程，
以及这个项目特有的约定（分层、主题变量、双语）。

[快速开始](#-快速开始) · [分支模型](#-分支模型) · [提交规范](#-提交规范) · [代码规范](#-代码规范) · [PR 清单](#-pr-清单)

</div>

---

## 🚀 快速开始

```bash
git clone https://github.com/JeffreyZhu0201/Terra-Wiki.git
cd Terra-Wiki
pnpm install
docker compose -f docker-compose.dev.yml up -d
pnpm dev
```

跑测试需要一个独立的测试库（55432 端口）：

```bash
DATABASE_URL=postgres://terra:terra@localhost:55432/terra_test pnpm db:migrate
pnpm test
```

> 💡 **包管理器固定 pnpm**（`packageManager` 字段已锁版本），不要用 npm / yarn。

---

## 🌿 分支模型

项目用 gitflow 三段式，**功能分支一律从 `develop` 切出、合回 `develop`**。

| 分支 | 作用 | 谁往里合 |
| --- | --- | --- |
| `main` | 生产分支，每个提交都对应线上可运行的状态 | 只接受 `release/*` 与 `hotfix/*` |
| `develop` | 集成分支，日常合并的目标 | `feature/*` `bugfix/*` `chore/*` `release/*` `hotfix/*` |
| `feature/<name>` | 新功能、新页面、新 MCP 工具 | 从 `develop` 切出，合回 `develop` |
| `bugfix/<name>` | 缺陷修复，流程同 feature | 从 `develop` 切出，合回 `develop` |
| `chore/<name>` | 依赖升级、构建配置、文档 | 从 `develop` 切出，合回 `develop` |
| `release/<version>` | 发布准备，只放发布前的修补 | 合回 `develop`（回灌）与 `main`（发布） |
| `hotfix/<version>` | 线上紧急修复，从 `main` 切出 | 合回 `main`（发布）与 `develop`（回灌） |

### 命名规范

```
<type>/<short-kebab-description>
```

- `type` ∈ {`feature`, `bugfix`, `chore`, `release`, `hotfix`}
- 描述用小写短横线，**不用中文**：`feature/tag-input-chips` ✅ / `feature/标签输入` ❌
- `release` / `hotfix` 后半段是版本号，不带 `v`：`release/0.4.0`

### 日常流程

```bash
git switch develop
git switch -c feature/my-change
#   ... 开发 ...
pnpm typecheck && pnpm test
git commit -m "feat(scope): 描述"
git push origin feature/my-change
#   → 开 PR 到 develop，等 CI 绿 + review 通过 → 合并 → 删分支
```

> ⚠️ **不要直接 push 到 `main` / `develop`**，也不 force push。

完整手册见 [docs/branching.md](docs/branching.md)。

---

## 📝 提交规范

Conventional Commits：`<type>(<scope>): <subject>`

```bash
feat(media): switch the admin media grid to a preview list
fix(auth): reject a disabled member's token
chore(deps): bump drizzle-orm to 0.45.4
docs(mcp): correct the agent access rules
```

**scope 取模块名**：`auth` `posts` `categories` `tags` `media` `mcp` `admin` `public`
`services` `db` `docker` `ui` `markdown` `uploads` `users` `settings`

**一次提交只做一件事。** 想顺手改点别的？拆成多个提交。

破坏性变更在 body 写 `BREAKING CHANGE:`：

```
feat(posts): rename the authorId column to author_id

BREAKING CHANGE: 数据结构变更，需要人工迁移。
```

---

## 🏗️ 代码规范

### 三层架构，职责不许越界

```
route.ts / actions.ts   只做：解析参数（zod）→ 调 service → 把 DomainError 映射成响应
src/server/services/*   业务规则、校验、slug/时间生成。只抛 DomainError，不碰 HTTP
src/server/db/*         Drizzle schema 与 client，所有 SQL 经 Drizzle
```

- 业务错误统一用 `DomainError`（`src/server/errors.ts`），code 取
  `not_found | conflict | forbidden | invalid | unauthorized`
- **service 层不写 `throw new Error`**
- HTTP 响应统一形状：`{ ok: boolean, message?: string, ...数据 }`，错误码用真实 HTTP status

### 前端

- 主题变量全部在 `globals.css` 的 `@theme` 块定义，**禁用 `@theme inline`**
  （它会把颜色内联进工具类、不输出 CSS 变量，导致 `.dark` 覆盖失效）
- 深色模式走 `next-themes`（`attribute="class"`），**新颜色必须同时给浅色和深色两套值**
- 组件默认 Server Component；`'use client'` 只给真需要交互的小件
- 界面文案一律走 `src/i18n/dictionaries/{zh,en}.ts`，**组件里不写死中英文**
- 正文样式集中在 `.prose`，改排版只动 `globals.css`

### MCP

- MCP 工具（`src/mcp/tools.ts`）与后台界面必须把同一个 `DomainError` 映射成同一段文案
- 新增工具时，同步更新 `src/mcp/instructions.ts`（随 initialize 下发给 Agent 的写入契约）
- 工具集 = 后台能力全集，减去平台管理（成员 / Token / 站点设置 / 审计查询不对 Agent 开放）

### 目录

| 放哪 | 什么 |
| --- | --- |
| `src/app/(public)/` | 公开页面 |
| `src/app/admin/` | 后台页面与 Server Actions |
| `src/server/services/` | 业务逻辑（没有对应文件就新建一个） |
| `src/lib/` | 纯函数工具 |
| `src/components/ui/` | 通用原语 |
| `src/components/layout/` | 页面布局件 |
| `src/components/article/` | 文章内件 |

---

## ✅ 完成的定义

**`pnpm typecheck` 与 `pnpm test` 全过。** CI 也跑这两条，没有 linter 步骤。

```bash
pnpm typecheck
pnpm test
```

涉及 UI 或接口的改动，PR 里还要写手动验证方式（怎么点、看什么）。

---

## 📋 PR 清单

开 PR 前对照 [.github/pull_request_template.md](.github/pull_request_template.md)：

- [ ] 关联 issue
- [ ] `pnpm typecheck` + `pnpm test` 全过
- [ ] 有迁移则附上 `drizzle/` 下新增的 SQL 文件
- [ ] 无破坏性变更，或写明回滚方式
- [ ] 目标分支是 `develop`

### 数据库迁移

```bash
pnpm db:generate   # 生成 drizzle/ 下的 SQL，不手写
pnpm db:migrate
```

> 🔴 迁移**不会自动回滚**。涉及 `src/server/db/schema.ts` 变更的迁移需要人工处理，
> 见 [docs/operations.md](docs/operations.md)。

---

## 🐛 报告问题

开 issue 时带上：

- **复现步骤**——怎么让它坏掉
- **期望的行为** vs **实际的行为**
- 环境：Next.js / Node / PostgreSQL 版本
- 相关日志或截图

---

## 💬 讨论

- 提 issue 前先搜一遍，避免重复
- 想法、方向上的讨论可以开 discussion 或 issue，先对齐再动手
- 不确定该改哪层？先问，别猜——架构越界的改动返工成本高

---

<div align="center">

**感谢你的贡献！** 🎉

[← 返回 README](README.md) · [分支手册](docs/branching.md) · [运维手册](docs/operations.md)

</div>
