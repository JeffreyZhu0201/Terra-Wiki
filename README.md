<div align="center">

# 🌍 Terra-Wiki

**面向程序员的技术文档站 —— Agent 通过 MCP 直接写内容，人在后台做策展。**

[![version](https://img.shields.io/badge/version-v0.4.0-1f4e79?style=flat-square)](https://github.com/JeffreyZhu0201/Terra-Wiki/releases)
[![next](https://img.shields.io/badge/Next.js-16.4.3-000000?style=flat-square&logo=next.js)](https://nextjs.org)
[![react](https://img.shields.io/badge/React-19.3.1-087ea4?style=flat-square&logo=react)](https://react.dev)
[![typescript](https://img.shields.io/badge/TypeScript-5.9.3-3178c6?style=flat-square&logo=typescript)](https://typescriptlang.org)
[![postgres](https://img.shields.io/badge/PostgreSQL-17-4169e1?style=flat-square&logo=postgresql)](https://postgresql.org)

[快速开始](#-快速开始-docker) · [MCP 接入](#-mcp-接入) · [工具集](#️-工具集) · [贡献指南](CONTRIBUTION.md)

</div>

---

## ✨ 特性

| | |
| --- | --- |
| 🗂️ **分类即独立空间** | 一篇文章只属于一个分类叶子，分类页里不会出现别的分类的文章 |
| 🤖 **MCP 原生接入** | Agent 用 22 个 MCP 工具建分类、写文章、传图、发布，不用碰浏览器 |
| 🌓 **中英双语** | 界面双语（zh/en），URL 不带语言前缀 |
| 🎨 **「工程手册」视觉** | 浅色纸面、普鲁士蓝强调、深色代码窗格，支持深色模式 |
| 🔒 **安全优先** | Markdown 不解析原始 HTML，上传按文件头验类型，停用成员即吊销 Token |
| 📊 **零外部依赖** | 没有评论、点赞、富文本、邮件订阅、外部搜索引擎 |

---

## 📖 快速开始（Docker）

```bash
cp .env.example .env
# 编辑 .env：至少填 BOOTSTRAP_ADMIN_EMAIL / BOOTSTRAP_ADMIN_PASSWORD
docker compose up -d
```

`docker compose up` 会依次完成三件事：

```mermaid
graph LR
    A["🗄️ 启动 PostgreSQL 17"] --> B["🔀 执行数据库迁移"] --> C["🚀 启动应用"]
    C --> D["🔑 首次登录自动建管理员"]
```

第一次登录用 `.env` 里的管理员账号，地址 <http://localhost:3000/admin>。

---

## 🛠️ 本地开发

```bash
pnpm install
docker compose -f docker-compose.dev.yml up -d   # 开发/测试库，5432 和 55432
DATABASE_URL=postgres://terra:terra@localhost:55432/terra_test pnpm db:migrate
pnpm dev                                          # http://localhost:3000
```

<details>
<summary><b>📋 可用命令</b></summary>

| 命令 | 作用 |
| --- | --- |
| `pnpm dev` | 开发服务器 |
| `pnpm test` | 跑测试（需要 `TEST_DATABASE_URL` 指向的库） |
| `pnpm typecheck` | TypeScript 类型检查 |
| `pnpm build` | 生产构建 |
| `pnpm db:generate` / `pnpm db:migrate` | 生成 / 执行迁移 |

</details>

> ⚠️ **完成的定义**：`pnpm typecheck` 与 `pnpm test` 全过才算做完。CI 也跑这两条。

---

## 🤖 MCP 接入

Agent 在自己的会话里建分类、写文章、发布，全程不打开浏览器。

### 1️⃣ 拿到 Token

每个成员**自带一枚 Token**。登录后台 → `/admin/team` → 对应成员那一行 →
点「复制 Token」或「复制 MCP 配置」。

<details>
<summary><b>📋 Token 规则</b></summary>

- Token 明文存库，随时可复制——后台要能直接拿去配 Agent
- 归属成员被停用后即刻失效（与网页端会话同一口径）
- 换 Token 直接改库，见 [docs/operations.md](docs/operations.md#token-轮换)
- ⚠️ Token 默认**没有直接发布权**（`can_publish = false`）：Agent 只能写草稿，
  要发布得由人在后台点。后台 `/admin/team` 每行有「放开 / 收回」开关可切换

</details>

### 2️⃣ 配置客户端

**客户端支持 HTTP transport 时**（推荐），直接连 `http://localhost:3000/api/mcp`：

```json
{
  "mcpServers": {
    "terra-wiki": {
      "type": "http",
      "url": "http://localhost:3000/api/mcp",
      "headers": {
        "Authorization": "Bearer <从 /admin/team 复制>"
      }
    }
  }
}
```

**客户端只说 stdio 协议时**，用仓库里的桥接脚本：

```json
{
  "mcpServers": {
    "terra-wiki": {
      "command": "node",
      "args": ["/绝对路径/terra-wiki/mcp/stdio-bridge.mjs"],
      "env": {
        "MCP_HTTP_URL": "http://localhost:3000/api/mcp",
        "MCP_TOKEN": "<从 /admin/team 复制>"
      }
    }
  }
}
```

> ⚠️ **两个 Accept 值都要带**：请求头需要
> `Accept: application/json, text/event-stream`，缺一个 MCP transport 会回 **406**。
> 桥接脚本已经自动带上，直连时需要自己写。

### 3️⃣ 连通性自检

```bash
curl -X POST http://localhost:3000/api/mcp \
  -H "Authorization: Bearer <token>" \
  -H "Accept: application/json, text/event-stream" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

能列出工具就通了。Agent 连上后还会收到一份**写入契约**（MCP `instructions`），
不用靠试错。

---

## 🛠️ 工具集

共 **22 个**，覆盖后台能力的全集，减去平台管理（成员、Token 签发、站点设置、审计查询不对外开放——Agent 给自己签发 Token 属于权限提升）。

### 📖 读

| 工具 | 说明 |
| --- | --- |
| `list_categories` | 列出全部分类树，含每个分类的文章数 |
| `list_tags` | 列出全部标签及其文章数 |
| `list_posts` | 列出文章。默认只返回已发布；`status` 可选 `draft` / `published` / `archived` |
| `get_post` | 按 `postId` 取文章，或按分类路径 + slug 取 |
| `search_posts` | 全文搜索文章，只返回已发布内容 |
| `list_media` | 列出媒体库里的图片 |
| `list_revisions` | 列出某篇文章的历史版本（最新在前） |

### ✏️ 写

| 工具 | 说明 |
| --- | --- |
| `create_post` | 创建一篇草稿。必须指定已存在的叶子分类；新标签自动创建 |
| `update_post` | 更新文章。`tags` 是最终集合，`addTags` / `removeTags` 做增删 |
| `publish_post` | 发布文章。Token 需要 `can_publish` 权限 |
| `unpublish_post` | 撤回文章，回到草稿。Token 需要 `can_publish` 权限 |
| `archive_post` | 归档文章（软删除） |
| `create_tag` | 创建标签。同名标签已存在时直接返回它 |
| `rename_tag` | 重命名标签，slug 同步更新，旧标签页留 301 |
| `merge_tags` | 把 `source` 标签合并进 `target` 标签，文章关联一起迁移 |
| `delete_media` | 删除媒体文件与记录 |
| `restore_revision` | 回滚到指定历史版本。只恢复 title / summary / body_md |
| `upload_image` | 上传图片（base64），返回可直接插入 Markdown 的 URL |
| `create_category` | 新建分类。slug 必须显式给出 |
| `rename_category` | 改分类的显示名或 slug。改 slug 会批量写 301 |
| `move_category` | 把分类移到另一个父分类下。会批量写 301 |
| `delete_category` | 删除空分类。有子分类或还有文章时会被拒绝 |

### 📌 几条要记住的规则

- 🗂️ **`create_post` 的分类必须是已存在的叶子分类**（给 id，不是路径）。传错了会报错，
  错误里会列出当前可用的分类，Agent 照着改就能继续。
- 🚦 **状态变更只有 `publish_post` / `unpublish_post` / `archive_post` 三个入口**。
  `create_post` / `update_post` 不接受 `status` 参数，传了会被参数校验拒绝。
- 🙋 **Token 默认没有直接发布权**：`publish_post` 会报「这个 Token 没有发布权限」。
  这是留给人的确认环节——Agent 产出草稿，人在后台点发布。
- 🔑 **权限继承 Token 归属作者**：作者角色的 Token 改不了别人的文章，也建不了分类；
  管理员的 Token 可以。
- 🔒 **`list_revisions` 只有作者本人与管理员可见**；看不到时报「文章不存在」而不是「没权限」。
- 🖼️ `upload_image` 收 base64 编码的图片内容，图片上限 **10 MB**。
- 🔤 中文标签、文章标题会转成拼音 slug（`冒烟测试` → `mao-yan-ce-shi`）。

以上约定在 MCP 的 `instructions` 里也发了一份——Agent 连上后就能读到。

---

## 🛡️ 安全说明

- 📝 **Markdown 不解析原始 HTML**：走 `remark-parse → remark-rehype`，HTML 标签被丢弃。
- 🖼️ **上传只接受 png / jpeg / webp / gif**，按**文件头**判断真实类型，扩展名和 MIME 都能伪造，
  文件头不会。SVG 不收。
- 🔑 **Token 即时失效**——改库换 Token 或停用成员即刻生效，不等缓存过期。
- 👥 **停用成员时，他的 MCP Token 一并失效**——Token 是独立于会话的一条通道。
- 🍪 会话 cookie 是 HttpOnly + SameSite=Lax，30 天过期。

---

## 🗂️ 项目结构

```
src/
├─ app/
│  ├─ (public)/                 公开站点：首页 / 分类页 / 文章页 / 标签 / 搜索 / sitemap
│  │  └─ [...segments]/page.tsx ★ 唯一 catch-all：分类页、文章页、标签过滤
│  ├─ admin/                    后台：仪表盘 / 文章 / 分类 / 标签 / 媒体 / 成员 / 审计 / 设置
│  ├─ api/
│  │  ├─ mcp/route.ts           MCP Streamable HTTP 端点（Bearer Token 鉴权）
│  │  ├─ auth/{login,logout}/   登录 / 登出
│  │  └─ track/                 浏览量计数
│  ├─ uploads/[...path]/        上传文件的伺服
│  └─ login/                    登录页
├─ components/
│  ├─ ui/                       shadcn 风格的基础组件
│  ├─ layout/                   顶栏、分类树、主题与语言切换
│  ├─ article/                  Markdown 渲染、目录、元信息
│  └─ admin/                    后台组件：编辑器、文章表、分类树、媒体、成员 Token
├─ server/
│  ├─ db/                       Drizzle schema 与连接
│  ├─ services/                 ← 唯一的业务逻辑所在
│  ├─ storage/                  本地磁盘存储
│  ├─ auth/                     密码与会话
│  ├─ markdown/                 渲染管线（unified + Shiki）
│  ├─ routes/                   路径解析
│  ├─ i18n/                     词典与语言解析
│  ├─ audit.ts                  审计日志
│  ├─ errors.ts                 DomainError，全站唯一业务错误类型
│  └─ mcp/                      MCP 工具定义（tools.ts）、写入契约（instructions.ts）
├─ mcp/stdio-bridge.mjs         stdio → HTTP 桥接脚本（仓库根，不在 src/ 下）
└─ drizzle/                     迁移文件
```

**架构分层**——请求链路固定三层，职责不许越界：

```
route.ts / actions.ts   只做：解析参数（zod）→ 调 service → 把 DomainError 映射成响应
src/server/services/*   业务规则、校验、slug/时间生成。只抛 DomainError，不碰 HTTP
src/server/db/*         Drizzle schema 与 client，所有 SQL 经 Drizzle
```

---

## ⚙️ 站点设置

所有站点配置存数据库，后台 `/admin/settings` 改，**立即生效**：

| 设置项 | 环境变量（初始值） | 影响范围 |
| --- | --- | --- |
| 站点名称 | `SITE_NAME` | 页面标题、顶栏、首页大标题、RSS 标题 |
| 站点描述 | `SITE_DESCRIPTION` | 页面 meta、RSS 描述 |
| 站点地址 | `SITE_URL` | RSS / sitemap / robots 的绝对地址 |
| RSS 标题 | `RSS_TITLE` | RSS channel 标题 |
| 站点关键词 | `SITE_KEYWORDS` | 页面 meta keywords |
| 页脚文字 | `SITE_FOOTER` | 公开页面底部 |

env 只是**出厂配置**：后台改过之后以数据库为准，改 env 只在该项还没存进数据库时生效。

---

## 🧰 技术栈

| 层 | 选型 |
| --- | --- |
| 框架 | Next.js 16（App Router）+ React 19 |
| 样式 | Tailwind CSS v4（主题变量在 `globals.css` 的 `@theme` 块） |
| 数据库 | PostgreSQL 17 + Drizzle ORM |
| 校验 | zod |
| Markdown | unified / remark + Shiki（双主题） |
| 主题 | next-themes（`attribute="class"`） |
| 国际化 | 自建轻量词典（`src/i18n/`） |
| 测试 | Vitest + 真实 PostgreSQL 测试库 |

---

## 📚 运维与协作

| 文档 | 内容 |
| --- | --- |
| [docs/operations.md](docs/operations.md) | 备份、恢复、升级、Token 轮换、常见故障 |
| [docs/branching.md](docs/branching.md) | 分支模型、PR 流程、发布与热修步骤 |
| [AGENTS.md](AGENTS.md) | 开发规范（分层、命名、i18n、主题变量的唯一事实源） |
| [CONTRIBUTION.md](CONTRIBUTION.md) | **如何参与贡献**：分支规范、提交规范、代码风格、本地验证 |

---

## 📄 License

MIT
