# Terra-Wiki 设计文档

日期：2026-10-29
状态：**已批准**（2026-10-29，作者确认 Q1=B / Q2=A）

---

## 0. 已确认的开放问题

| # | 问题 | 结论 |
|---|---|---|
| Q1 | **Agent 能用哪些工具？** | **B — 全给**。MCP 工具集与后台能力逐操作对齐（按归属作者的角色）。唯一例外是平台管理（成员 / Token 签发 / 站点设置 / 审计日志查询）不对 MCP 开放。 |
| Q2 | **Agent 产出的文章要不要人工批准才能公开？** | **A — 要**。新签发的 Token 默认 `can_publish=false`，只产出草稿；管理员签发时显式勾选才允许直发。人在后台点发布不受限制。 |

其余 10 个问题（路由消歧、MCP 一致性边界、`can_publish` 绕过、搜索索引、中文 slug、浏览量去重表、分类页聚合范围、分类移动/删除范围、revision 语义、MCP 读可见范围）**已拍板并写进本文档**，见 §12。

---

## 1. 意图与动机

Terra-Wiki 是一个**给程序员写技术文档的博客系统**。它长得像 Wiki.js（分类即独立空间、树形导航），但真正的差异点只有一个：

> **它主要不由人写，而是由 Agent 通过 MCP 写。**

人做的是策展——建分类、打标签、审稿、改措辞、看审计日志。Agent 做的是生产——一次调用写好一篇完整的技术文档，指定分类和标签，直接落库。

这个差异决定了整个架构：**MCP 不是"给现有 CMS 加的一个接口"，而是第一公民**。后台管理界面存在的理由不是"写博客"，而是"管住 Agent 写出来的东西"。

### 为什么是"隔离"而不是"标签"

传统博客用标签做横向切分，一篇文章同时属于多个标签，于是"这个标签页里到底有什么"变得不可预测。Terra-Wiki 反过来：

- **分类是硬边界**。一篇文章只属于一个分类叶子。分类页里永远不会出现别的分类的文章。
- **标签是横向索引**，不破坏隔离。点标签默认在当前分类内过滤。

这条规则让 Agent 的写入行为可预测：一个分类就是一篇文档所在的目录树中的一格，Agent 不能模糊地"塞到几个地方去"。

### 谁能做什么

| 角色 | 读 | 写文章 | 建分类 | 建标签 | 管成员/Token/设置 |
|---|---|---|---|---|---|
| 访客 | ✅ | ❌ | ❌ | ❌ | ❌ |
| 作者 (author) | ✅ | 仅自己的文章 | ❌ | ✅ | ❌ |
| 管理员 (admin) | ✅ | 任何文章 | ✅ | ✅ | ✅ |
| MCP Token | 继承归属作者 | 继承归属作者（按角色）+ `can_publish` 开关 | 同归属作者 | ✅ | ❌ |

**Agent 的权限按角色继承，不再有独立的"Agent 禁令"**（Q1=B 推翻了早先"Agent 不可建分类"的决定）。MCP 工具集与后台能力逐操作对齐：文章、标签、媒体、分类树、revision 的读写两边等价；只有平台管理（成员、Token 签发、站点设置、审计日志查询）不对 MCP 开放。

建分类是其中风险最高的一项，因此加**两道护栏**：① 必须显式传 slug，格式与保留字校验同 §7.1——slug 是 Agent 明确声明的，不是服务端从标题猜的；② 分类树的任何变更都进审计日志，后台分类树页可一眼看出结构变化，便于事后清理。标签同理可随意创建（自动归一化为小写，事后可合并）。

---

## 2. 目标 / 非目标 / 反目标

### 目标

1. 分类隔离的内容站：树形分类 + `/{分类路径}/{文章slug}` 的永久链接。
2. Markdown 正文，Shiki 代码高亮（双主题），右侧目录锚点导航。
3. **MCP 服务端点**，与网站同进程，Agent 通过 Bearer Token 认证；附带 stdio 桥接脚本供本地 Claude Code / Claude Desktop 使用。
4. 多作者协作 + 角色（admin / author），审计日志记录每一次写入的 actor（人或 Token）。
5. 后台管理页 `/admin`：文章列表与编辑器、分类树、标签、媒体库、成员、Token、审计日志、站点设置。
6. 全文搜索（Postgres `pg_trgm`，不引入外部搜索引擎）。
7. 图片上传（本地卷 + 存储接口抽象）。
8. 浏览量统计（按天分桶，不引入 Redis）。
9. UI 双语（zh / en），URL 不带语言前缀。
10. 暗色模式。
11. RSS、Sitemap、SEO meta。
12. Docker 打包 + Compose 一键部署（app + postgres）。

### 非目标（明确不做）

- 评论系统
- 点赞 / 收藏
- 富文本所见即所得编辑器（只做 Markdown）
- 编辑器内的图片裁剪 / 去色等图像处理
- SVG 上传（一律拒绝，见 §9.6）
- 邮件订阅 / 通知
- Elasticsearch / Meilisearch / Algolia
- 自定义主题（CSS 变量可换，但不做主题编辑器）
- 内容的 per-post 多语言版本
- 全文内容的 AI 摘要 / 相关推荐
- 多租户 / 多站点
- 图片存储的云端方案（只做本地卷 + 可替换接口）

### 反目标（做出来就算失败）

- **MCP 和后台界面行为不一致**。用户在后台能改标题，Agent 就必须能改标题，反之亦然。两边走同一套 service 层，不允许出现"只有一边支持"的操作——**除非该差异被显式声明为"有意为之"**（见 §8.5）。
- **分类隔离被绕过**。任何一篇出现在 A 分类页的文章，其 `category_id` 必须确实属于 A 的子树。
- **页面首屏被统计或搜索拖慢**。浏览量计数是 fire-and-forget；搜索走 trigram 索引。
- **正文在移动端或窄栏溢出**。代码块必须横向滚动而不是撑破布局。
- **权限可被绕过**。任何一条能改 `status` 的路径，都必须经过同一道发布校验。

---

## 3. 约束

### 技术约束（已确认）

| 项 | 选择 | 版本（2026-10-29 最新） |
|---|---|---|
| 框架 | Next.js App Router | 16.4.3 |
| React | React | 19.3.1 |
| 样式 | Tailwind CSS v4 + shadcn/ui | 4.3.3 |
| 数据库 | PostgreSQL | 17（docker: `postgres:17-alpine`） |
| ORM | Drizzle ORM + drizzle-kit | 0.45.4 |
| Markdown | react-markdown + remark-gfm + **Shiki** | Shiki 4.5.0 |
| 校验 | Zod | 4.6.7 |
| MCP | @modelcontextprotocol/sdk | 1.32.2 |
| 字体 | next/font（Inter / Noto Serif SC / JetBrains Mono） | — |
| 部署 | Docker 多阶段 + docker compose | Docker 29 / compose v5 |

### 环境约束

- 本机 Node v24.19.0、pnpm 12.15.0、Docker 29.4.0 + Compose v5.1.2；**无本地 psql**（一切通过容器）。
- **Agent 只在本机运行**（用户明确选择）。因此：
  - MCP 主路径是 **stdio 桥接脚本 → 本机 `localhost:3000/api/mcp`**。
  - HTTP 端点仍然是唯一真相来源（桥接脚本只是转发器），这样将来要远程接入不用改任何东西。
  - 文档里需要写清楚本地起 compose 后如何配置 `claude mcp add`。
- 单机部署，无 CDN、无对象存储、无邮件服务。
- **基础镜像用 `node:24-slim`（Debian）而非 alpine**：`@node-rs/argon2` 是原生模块，musl 上的预编译产物不可靠。

### 架构约束（来自用户的选择）

- **同一 service 层**被后台 Server Actions 和 MCP 工具共同调用。
- **不引入 REST API 层**。后台界面用 Server Actions（服务端），Agent 用 MCP 工具，二者共享 service。
- 正文存 Postgres `text`，不存文件系统。
- 文章状态机：`draft` → `published` → `archived`（可回 draft）。

---

## 4. 方案对比（我们考虑过的路）

### 4.1 后台形态

| 方案 | 描述 | 取舍 | 结论 |
|---|---|---|---|
| A. 纯策展台 | 后台只管分类/标签/Token/流水，正文只能由 Agent 写 | 最省，但人想改一个错别字就得开 Agent | ❌ |
| B. 策展台 + 轻量 Markdown 编辑器 | Agent 批量产出，人做小修和措辞把关 | 多一个编辑器（成本≈一个 textarea + 预览），换来"人始终有最终话语权" | ✅ **选中** |
| C. 完整 CMS | frontmatter 表单 + 草稿流转 + 富文本 | 和已有 Agent 能力重复投资 | ❌ |

### 4.2 账号模型

| 方案 | 描述 | 取舍 | 结论 |
|---|---|---|---|
| A. 单作者 | 只有一个人 + Agent Token | 最省，但半年后面对一堆来源不明的文章，想追"哪个 Agent 用哪把 Token 发的"时无路可走 | ❌ |
| B. 多作者 | 多个作者各有账号，Token 归属作者 | 多一张用户表 + 登录流程；换来可追溯性 | ✅ **选中** |
| C. 私有站 | 读者也要登录 | 与"博客/文档站"的定位不符 | ❌ |

### 4.3 分类隔离语义

| 方案 | 描述 | 取舍 | 结论 |
|---|---|---|---|
| A. 分类即独立空间 | 树形分类，`/{分类路径}/{文章slug}`，一篇文章一个叶子 | slug 唯一性范围收窄到分类内；分类改名要 301 | ✅ **选中** |
| B. 分类只是过滤维度 | `/blog/{slug}`，分类纯元数据 | 隔离是假的，挪分类就断链 | ❌ |
| C. 多对多分类 | 一篇文章挂多个分类 | 隔离名存实亡，分类页混文章 | ❌ |

### 4.4 MCP 接入形态

| 方案 | 描述 | 取舍 | 结论 |
|---|---|---|---|
| A. 仅 HTTP | `/api/mcp` 跑在 Next.js 进程内 | 本地 `claude mcp add` 接不上，每次得走网络 | ⚠️ 部分 |
| B. 独立 MCP 服务器 | 独立进程 / 独立镜像 / stdio | 天然容易变成两套业务逻辑各写一遍 | ❌ |
| C. HTTP 为真相来源 + stdio 桥接 | HTTP 端点唯一实现，另附 ~40 行转发脚本 | 多一个小脚本；换来本地体验和远程扩展性 | ✅ **选中** |

### 4.5 多语言范围

| 方案 | 描述 | 取舍 | 结论 |
|---|---|---|---|
| A. 真·多语言 | per-post 翻译版本，URL 带 lang 前缀 | 数据模型拆两张表、分类×语言二维隔离、发布半成品状态 | ❌ |
| B. 仅 UI 多语言 | 后台/前台界面 zh/en，内容单语言 | 几乎零成本 | ✅ **选中** |
| C. 分类模拟语言 | `guide-zh` / `guide-en` 两个分类 | 分类树割裂，无统一导航 | ❌ |

### 4.6 视觉方向

| 方案 | 描述 | 取舍 | 结论 |
|---|---|---|---|
| 1. 工程手册 | 浅色纸面、衬线中文标题、深色代码窗格、细规则线 | 需要认真做中文排版细节；辨识度高 | ✅ **选中** |
| 2. 深色优先 | 全站深色、文件树导航、等宽字体承担排版 | 最常见的开发者工具审美，容易撞脸 | ❌（仅借用其树形导航结构） |
| 3. 蓝图 | 网格纸背景、工程图式装饰 | 个性强但长时间阅读累 | ❌ |

### 4.7 前台路由形态（实现期发现的设计缺口，已定）

| 方案 | 描述 | 取舍 | 结论 |
|---|---|---|---|
| A. 两个平级 catch-all | `[...category]/page.tsx` + `[...category]/[slug]/page.tsx` | **Next.js 不会在"文章查不到"时回退到另一条路由文件**，深度 ≥2 的分类页直接不可达 | ❌ |
| B. 单一 catch-all + 解析顺序 | 一个 `[...segments]/page.tsx`，内部按固定顺序消歧 | 路由文件数少，消歧规则集中在一处，可测 | ✅ **选中** |

---

## 5. 视觉与交互设计（方向 1「工程手册」）

### 5.1 设计令牌

**亮色**

| 名称 | 值 | 用途 |
|---|---|---|
| `paper` | `#F4F5F6` | 页面底色 |
| `surface` | `#FFFFFF` | 面板、卡片 |
| `ink` | `#14171C` | 正文 |
| `ink-muted` | `#5A6472` | 次要文字、元信息 |
| `rule` | `#DDE1E6` | 细规则线、边框 |
| `accent` | `#164A7B` | 普鲁士蓝：链接、焦点环、当前分类标记 |
| `accent-hover` | `#123C63` | |
| `accent-soft` | `#EAF0F7` | 选中背景 |
| `code-bg` | `#10161D` | 代码窗格底 |
| `code-ink` | `#E6EDF3` | 代码窗格文字 |
| `danger` | `#B42318` | |
| `success` | `#147D52` | |

**暗色**（不是把亮色反过来）

| 名称 | 值 |
|---|---|
| `paper` | `#0F1318` |
| `surface` | `#151A21` |
| `ink` | `#E6EAF0` |
| `ink-muted` | `#98A2B3` |
| `rule` | `#232A33` |
| `accent` | `#6BA8E0`（提亮以保证对比度） |
| `accent-soft` | `#16283A` |
| `code-bg` | `#0A0E13` |

暗色下代码窗格比页面底色**更深**（亮色下代码窗格比纸面更深），保持"代码是个嵌在纸面上的深色物体"这个隐喻一致。

### 5.2 字体

| 角色 | 字体 | 说明 |
|---|---|---|
| 标题（中文） | Noto Serif SC / 思源宋体 | 只用于 H1–H3 和文章标题；next/font 按 unicode-range 切片 |
| 正文（中文） | 系统栈：`-apple-system, "PingFang SC", "Microsoft YaHei"` | **不加载 Noto Sans SC**，CJK 字体体积过大 |
| 正文/UI（拉丁） | Inter | |
| 代码与元信息 | JetBrains Mono | 元信息（日期、slug、标签）也用它 |

### 5.3 字号阶梯（中文正文放宽行高）

| 级别 | 字号 / 行高 | 字距 |
|---|---|---|
| Display | 40 / 1.15 | -0.01em |
| H1（文章标题） | 32 / 1.25 | -0.005em |
| H2 | 24 / 1.30 | 0 |
| H3 | 19 / 1.40 | 0 |
| Body | 16 / **1.75** | 0 |
| Small | 14 / 1.60 | 0 |
| Micro（mono 元信息） | 12.5 / 1.50 | +0.01em |

**正文列宽 ≤ 68 字符**（约 720px @16px）。

### 5.4 布局

**文章页（桌面）—— 三栏**

```
┌──────────────────────────────────────────────────────────────┐
│ TERRA  · 指南 参考 随笔          ⌕ 搜索   🌙   中 / EN       │  56px 顶栏
├────────────┬─────────────────────────────────┬───────────────┤
│ 分类树      │  分类 › 子分类                   │ 本文目录       │
│ ▾ 指南      │  用 MCP 给 Agent 装上发布能力     │ 准备工作       │
│   入门      │  2026-10-29 · 8 min · #mcp #ts   │  安装          │
│   部署  ◀   │  ─────────────────────────────   │  配置          │
│ ▸ 参考      │  正文正文正文正文正文正文正文正文  │  验证          │
│ ▸ 随笔      │  正文正文正文正文正文正文正文正文  │                │
│            │  ┌────────────────────────────┐  │               │
│ 240px      │  │▸ src/app/api/mcp/route.ts TS ⧉│  │ 200px         │
│            │  │  export async function …    │  │               │
│            │  └────────────────────────────┘  │               │
└────────────┴─────────────────────────────────┴───────────────┘
```

- 左栏：可折叠分类树，**当前分类用 accent 左标记 + 加粗**表示；切换分类 = 切换到另一棵独立的树。
- 中栏：内容列。
- 右栏：目录锚点（仅文章页），滚动高亮当前小节。
- 移动端：顶栏折叠菜单，目录收进文章顶部的下拉。

**分类页**：左树 + 中栏文章列表（标题 / 摘要 / 日期 / 阅读时长 / 标签），分类头部有名称、描述和置顶文章。列表**分页**，每页 20 条。

**首页 `/`**：最近更新流 + 置顶文章 + 分类快捷入口。分类导航不在首页重复（左侧树已经提供）。

**后台 `/admin`**：左侧固定导航（文章 / 分类 / 标签 / 媒体 / 团队 / Token / 审计 / 设置），右侧内容区。编辑器在宽屏为左右分栏（左 Markdown、右预览），窄屏切换为标签页。

### 5.5 签名元素：代码窗格

代码块不是一个带灰底和圆角的 `<pre>`，而是一个**独立的深色物体**：

- 顶部一条 32px 的窗格条，左侧是文件名（来自 fence 的 `title="..."` meta）或语言标签，右侧是复制按钮。
- 下面才是代码区。
- 横向溢出时代码区自己滚动，**不撑破页面**。
- Shiki 双主题（亮色 `github-light` / 暗色 `vitesse-dark`），通过 CSS 变量切换，不重新渲染。

### 5.6 原则

1. **代码是主角**——深色窗格是页面里唯一的"硬件感"物体。
2. **纸面阅读优先**——正文 68 字符宽、中文行高 1.75、长文不累。
3. **用细规则线，不用盒子**——分隔靠 hairline 和留白，不靠一圈卡片边框。
4. **分类即空间**——树的层级和视觉分组强相关，当前位置始终明确。
5. **强调色克制**——一个普鲁士蓝，只出现在链接、焦点态、当前项。
6. **暗色不是反色**——深浅关系被重新设计过。

---

## 6. 数据模型

```sql
-- 用户与权限
users(id pk, email unique, password_hash, name, role enum('admin','author'),
     locale_pref enum('zh','en') default 'zh', created_at, updated_at)
sessions(id pk, user_id fk->users, token_hash unique, expires_at, created_at)

-- 内容树
categories(id pk, parent_id fk->categories null, slug, name, description,
           position int, path text, depth int, created_at, updated_at)
  unique(parent_id, slug)
  unique index on (slug) where parent_id is null      -- 顶级分类 slug 也必须全局唯一
tags(id pk, slug unique, name, created_at)             -- slug 小写归一化

-- 文章
posts(id pk, category_id fk->categories, slug, title, summary text null,
      body_md text, status enum('draft','published','archived') default 'draft',
      author_id fk->users, featured bool default false, cover_image text null,
      published_at, created_at, updated_at)
  unique(category_id, slug)
post_tags(post_id fk, tag_id fk, pk(post_id, tag_id))
post_revisions(id pk, post_id fk, title, summary text null, body_md,
               author_id fk, source enum('human','agent'), created_at)

-- 统计
post_view_daily(post_id fk, day date, views int, pk(post_id, day))
post_view_visitors(post_id fk, day date, vid_hash text, pk(post_id, day, vid_hash))

-- Agent 接入
mcp_tokens(id pk, name, token_hash unique, author_id fk->users,
           can_publish bool default false, last_used_at, revoked_at, created_at)

-- 治理
audit_logs(id pk, actor_type enum('user','token'), actor_id, action text,
           target_type text, target_id text, meta jsonb, created_at)
uploads(id pk, filename, stored_path, mime, bytes, uploader_id fk->users, created_at)
redirects(id pk, from_path unique, to_path, http_status int default 301, created_at)
site_settings(key pk, value jsonb)
```

### 关键约束

- `categories.path` 是物化路径（如 `guide/rust`），用 `path text` + 应用层维护（创建/移动时重算子树）。查询用 `path LIKE 'guide/%'`。避免依赖 Postgres 扩展。
- 文章必须落在**叶子**分类：service 层校验"该分类没有子分类"。
- `posts.slug` 在**同一 category_id 内**唯一。
- **文章 slug 与同级子分类 slug 互斥**：同一个父分类下，子分类叫 `rust`，则该分类下不能有 slug 为 `rust` 的文章。这是 URL 消歧的前提（见 §7.1）。
- `posts.slug` 与 `categories.slug` 格式统一：ASCII kebab-case，`^[a-z0-9]+(-[a-z0-9]+)*$`，长度 1–80，不含 `/`。
- 顶层分类 slug 全局唯一（`unique index ... where parent_id is null`），因为 `unique(parent_id, slug)` 对 `NULL` 不生效。
- `post_revisions` 在**内容字段变化时**写入完整快照，`source` 区分人改还是 Agent 改。
- `post_view_visitors.vid_hash` 存 `sha256(vid + salt)`，不存原始 UUID。

---

## 7. 路由

### 7.1 公开路由与消歧规则

**只有一个 catch-all**：`app/(public)/[...segments]/page.tsx`。

解析顺序（**固定、可单测**）：

```
请求路径 /a/b/c
 0. 归一化：去首尾斜杠；空路径 → 首页
 1. 查 categories.path = 'a/b/c'
      命中 → 分类页（子树聚合）
 2. 取最后一段作 slug，'a/b' 作分类路径
      查 posts join categories on posts.category_id = categories.id
        where categories.path = 'a/b' and posts.slug = 'c' and status = 'published'
      命中 → 文章页
 3. 查 redirects.from_path = '/a/b/c'
      命中 → 301 到 to_path
 4. 否则 404
```

第 1 步和第 2 步**不可能同时命中**，因为同级 slug 互斥（§6）。

| 路径 | 说明 |
|---|---|
| `/` | 跨分类聚合流：最近更新、置顶、各分类入口 |
| `/{分类路径...}` | 分类页（该**子树**下所有文章） |
| `/{分类路径...}/{文章slug}` | 文章页 |
| `/{分类路径...}?tag={slug}` | 分类内的标签过滤（文章页上的标签链接指向这里） |
| `/tags` | 全局标签索引 |
| `/tags/{slug}` | 标签页（跨分类聚合） |
| `/search?q=` | 搜索结果 |
| `/sitemap` | HTML 站点索引页（所有分类 + 全部文章） |
| `/rss.xml` `/sitemap.xml` `/robots.txt` | |
| `/login` | 登录 |

**保留字**（不能作为顶级分类 slug）：`all`、`tags`、`search`、`sitemap`、`login`、`admin`、`api`、`_next`、`uploads`、`rss.xml`、`sitemap.xml`、`favicon.ico`。

### 7.2 后台 `/admin`

| 路径 | 说明 | 权限 |
|---|---|---|
| `/admin` | 仪表盘：草稿箱、最近活动、统计 | author |
| `/admin/posts` | 文章列表（筛选状态/分类/作者/标签，分页） | author |
| `/admin/posts/new` `/admin/posts/[id]` | 编辑器 | author（仅自己的，admin 全部） |
| `/admin/categories` | 分类树管理（建/改名/移动/删空分类） | **admin** |
| `/admin/tags` | 标签管理（合并/重命名） | author |
| `/admin/media` | 图片库（列表/删除） | author |
| `/admin/team` | 成员管理 | **admin** |
| `/admin/tokens` | MCP Token 签发/吊销 | **admin** |
| `/admin/audit` | 审计日志 | **admin** |
| `/admin/settings` | 站点设置（站名、描述、logo、RSS） | **admin** |

### 7.3 API 路由

| 路径 | 说明 |
|---|---|
| `POST /api/mcp` | **MCP Streamable HTTP 端点** |
| `GET /api/mcp` | MCP SSE 流（协议需要时） |
| `POST /api/track` | 浏览量计数（fire-and-forget，无鉴权，进程内限流） |
| `POST /api/auth/login` `/api/auth/logout` | 登录/登出 |

**没有 REST API 层**：后台界面走 Server Actions，MCP 走工具，两者共享 service。

---

## 8. MCP 设计

### 8.1 传输与认证

- 端点：`POST /api/mcp`，`@modelcontextprotocol/sdk` 的 `StreamableHTTPServerTransport`。
- 认证：`Authorization: Bearer <token>`。token 明文只在签发时显示一次，库里存 `sha256(token)`。
- 鉴权流程：解析 token → 查 `mcp_tokens` → 未吊销且未过期 → 得到归属作者 → 得到角色和 `can_publish`。
- 未认证返回 401，token 吊销返回 403。

### 8.2 工具集

| 工具 | 写权限 | 说明 |
|---|---|---|
| `list_categories` | 读 | 树形结构，含每类文章数 |
| `list_tags` | 读 | |
| `list_posts` | 读 | 过滤：category / tag / status / author / limit。**默认只返回 `published`** |
| `get_post` | 读 | 按 id 或 category+slug。**他人草稿不可见**（见 §8.5） |
| `search_posts` | 读 | trigram 搜索，只返回 `published` |
| `create_post` | 写 | 必须给已存在的分类；可给新标签；**只能产出 `draft`** |
| `update_post` | 写 | 局部更新（含增删标签）。**不接受 `status` 参数** |
| `publish_post` | 写 + `can_publish` | 唯一的发布入口 |
| `unpublish_post` | 写 + `can_publish` | 回到 `draft` |
| `archive_post` | 写 | |
| `create_tag` | 写 | Agent 可建标签 |
| `upload_image` | 写 | 通过 MCP content block 传 base64，返回 `/uploads/...` URL 和可插入的 Markdown |
| `rename_tag` | 写 | 重命名标签（slug 同步更新） |
| `merge_tags` | 写 | 把 source 标签合并进 target 标签（文章关联迁移） |
| `list_media` | 读 | 媒体库列表 |
| `delete_media` | 写 | 删除媒体文件与记录 |
| `list_revisions` | 读 | 某篇文章的版本历史 |
| `restore_revision` | 写 | 回滚到指定 revision（只恢复 title/summary/body_md） |
| `create_category` | 写 | **必须显式传 slug**；父分类可省略（顶级） |
| `rename_category` | 写 | 改显示名或 slug（改 slug 会批量写 301） |
| `move_category` | 写 | 改父分类（会批量写 301） |
| `delete_category` | 写 | 仅限空分类 |

**状态变更只能走 `publish_post` / `unpublish_post` / `archive_post` 三个专用工具**，`create_post` / `update_post` 一律不接受 `status` 字段。这条约束是为了消除"`can_publish=false` 的 Token 通过 `update_post` 偷发布"的绕过路径。

**没有 `delete_post`**（软删除 = `archive_post`）；`delete_category` 只允许删空分类，service 层强制。

**Q1=B 之后的工具边界**：MCP 工具集 = 后台能力全集（按归属作者的角色）。唯一不开放的是平台管理（成员、Token 签发、站点设置、审计日志查询）。**状态变更仍然只有 `publish_post` / `unpublish_post` / `archive_post` 三个入口**，`create_post` / `update_post` 不接受 `status`——这是 `can_publish` 的硬边界，不因"全给"而放开。

### 8.3 行为一致性保证

所有工具和后台 Server Actions 都只调用 `src/server/services/*`：

```
src/server/services/
  posts.ts      createPost, updatePost, publishPost, unpublishPost, archivePost, listPosts, getPost
  categories.ts createCategory, renameCategory, moveCategory, deleteCategory, listTree
  tags.ts       createTag, renameTag, mergeTags, listTags
  media.ts      upload, delete, list
  revisions.ts  snapshot, listRevisions, restoreRevision
  audit.ts      record(actor, action, target, meta)
  auth.ts       verifyPassword, createSession, requireUser
```

MCP 工具层（`src/mcp/tools.ts`）只做**参数解析（Zod）→ 调 service → 序列化返回**，不含业务规则。

### 8.4 stdio 桥接

`mcp/stdio-bridge.mjs`（约 40 行）：从 stdin 读 JSON-RPC 行，转发到 `MCP_HTTP_URL`（默认 `http://localhost:3000/api/mcp`），带上 `MCP_TOKEN`；响应写回 stdout。

配置示例（写进 README）：

```json
{
  "mcpServers": {
    "terra-wiki": {
      "command": "node",
      "args": ["/abs/path/terra-wiki/mcp/stdio-bridge.mjs"],
      "env": {
        "MCP_HTTP_URL": "http://localhost:3000/api/mcp",
        "MCP_TOKEN": "<从 /admin/tokens 复制>"
      }
    }
  }
}
```

### 8.5 权限矩阵（人类 vs MCP）

| 能力 | 访客 | 作者 | 管理员 | MCP Token |
|---|---|---|---|---|
| 读已发布文章 | ✅ | ✅ | ✅ | ✅ |
| 读**他人草稿** | ❌ | ❌ | ✅ | ❌ |
| 读**自己**的草稿 | ❌ | ✅ | ✅ | ✅（继承归属作者） |
| 创建文章（草稿） | ❌ | ✅ | ✅ | ✅ |
| 编辑文章 | ❌ | 仅自己的 | 任何 | 仅归属作者的（继承） |
| 发布文章 | ❌ | ✅（仅自己的） | ✅ | **仅当 token `can_publish=true`** |
| 建标签 | ❌ | ✅ | ✅ | ✅ |
| 合并/重命名标签 | ❌ | ✅ | ✅ | 同归属作者 |
| 建分类 | ❌ | ❌ | ✅ | 同归属作者（须显式传 slug） |
| 改名/移动/删除分类 | ❌ | ❌ | ✅ | 同归属作者（删除仅限空分类） |
| 删除媒体 | ❌ | ✅ | ✅ | 同归属作者 |
| 回滚 revision | ❌ | ✅（仅自己的） | ✅ | 同归属作者（仅自己的） |
| 管成员/Token/设置 | ❌ | ❌ | ✅ | ❌ |
| 查审计日志 | ❌ | ❌ | ✅ | ❌ |

**规则**：MCP 工具的权限**等于归属作者在后台的权限**（逐操作对齐），再叠加 token 自身的 `can_publish` 开关。作者角色的 Token 做不到分类治理，和后台里的作者做不到是同一回事——这是角色差异，不是通道差异。MCP 读工具的可见范围与人类后台**完全一致**：不存在"Agent 能看到人看不到的草稿"这种情况。

**MCP 与后台的通道差异（Q1=B 后仅剩一处）**：内容与结构治理能力两侧完全等价。差异只在**平台管理**——成员管理、Token 签发、站点设置、审计日志查询不对 MCP 开放，因为 Agent 给自己签发 Token 属于权限提升。

---

## 9. 关键实现细节

### 9.1 认证（自研，不引入 Auth.js）

理由：Auth.js v5 的 Credentials Provider 与数据库 session 组合笨重；而"邮箱+密码+可吊销 session"用 60 行代码就能做对，且完全可控。

- 密码哈希：`argon2id`（`@node-rs/argon2`），成本参数按部署机调整。
- session：32 字节随机 token，库里存 `sha256(token)`，cookie `httpOnly` + `sameSite=lax` + `secure`（生产）+ 30 天过期 + 滑动续期。
- **鉴权落在 `/admin` 的 layout（Server Component）里**，不放在中间件：Next.js 16 中 `middleware.ts` 已被 `proxy.ts` 取代，且中间件不适合做 DB 查询。`proxy.ts` 只做"有没有 session cookie"的快速判断并重定向 `/login`，真正的 session 校验和角色门在 layout 里完成。
- 首次启动引导：若 `users` 表为空，用环境变量 `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD` 创建第一个 admin。

### 9.2 搜索

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX posts_title_trgm   ON posts USING gin (title   gin_trgm_ops);
CREATE INDEX posts_summary_trgm ON posts USING gin (summary gin_trgm_ops);
CREATE INDEX posts_body_trgm    ON posts USING gin (body_md gin_trgm_ops);
```

- **trigram 索引只对 ≥3 字符的模式串生效**。中文两字词（"索引"）走不了索引，会退化成 `ILIKE` 全表顺序扫描。
- **接受这个代价**：博客量级在数千篇，单次全表扫是毫秒级。若将来文章数超过 ~5 万，改用派生列（`search_text` 存 2-gram 切分）或 `tsvector`——届时是独立决策，不在 v1 范围。
- 排序：标题命中权重 > 摘要命中 > 正文命中；同级按发布时间倒序。
- 只搜 `status='published'` 的文章（除非管理员显式搜索草稿）。

### 9.3 分类移动与重定向

- v1 范围：**支持创建、改名（仅改显示名）、移动（改父分类）、删除（仅空分类）**。删除非空分类被拒绝，错误信息列出该分类下待迁移的文章数。
- 改名（改 slug）或移动 → 收集该子树所有受影响路径（旧分类页路径 + 所有后代文章路径），在 `redirects` 表写入 `from_path → to_path`。
- **批量写 redirects 必须在同一个数据库事务里**，要么全成要么全不成。
- 公开页面解析路径时先查 `redirects`（带进程内 LRU 缓存），命中则 301。

### 9.4 Markdown 渲染

- `react-markdown` + `remark-gfm`（表格、任务列表、删除线）。
- 代码高亮：**Shiki**，服务端渲染，双主题（`github-light` / `vitesse-dark`），CSS 变量切换。
- 自定义 fence 处理：读取 code node 的 `meta`（如 ```` ```ts title="src/app/api/mcp/route.ts" ````），渲染成代码窗格的顶栏。
- 标题锚点：`github-slugger` 生成 id，`rehype-slug` 注入；目录从渲染树里抽 h2/h3 生成。
- XSS：**不启用 `rehype-raw`**，Markdown 里不解析原始 HTML（刻意的安全取舍，写进 README）。
- **编辑器预览复用同一个服务端渲染器**：以 debounce 500ms 调一个 Server Action 拿渲染后的 HTML。避免在客户端引入 Shiki（体积太大），也避免出现两套渲染逻辑。

### 9.5 浏览量统计

- 文章页挂一个 `navigator.sendBeacon`（降级 `fetch`）到 `POST /api/track`，body 为 `{postId}`。
- 服务端：
  1. 读 `vid` cookie（首次访问生成 UUIDv4，写 httpOnly cookie，1 年）。
  2. `vid_hash = sha256(vid + SALT)`。
  3. `INSERT INTO post_view_visitors (post_id, day, vid_hash) ON CONFLICT DO NOTHING`——插入成功才算一次新访客。
  4. 插入成功 → `upsert post_view_daily` 把当日 `views` +1。
- 页面显示值 = `post_view_daily` 求和（进程内缓存 60s）。
- 限流：同一 IP 每分钟最多 N 次（进程内 LRU 内存表；单机部署够用，重启失效可接受）。

### 9.6 图片上传

- multipart，最大 10MB。
- 允许类型：`png` / `jpeg` / `webp` / `gif`。**SVG 一律拒绝**（可含脚本，且需要额外的消毒依赖）。
- 存储：写入 `UPLOAD_DIR`（compose 中挂卷到 `/app/uploads`），按 `YYYY/MM` 分片子目录，通过 `/uploads/[...path]` 路由伺服。
- 文件名由服务端生成（`<base36 时间戳>-<随机串>.<ext>`），**不使用用户提供的文件名**。
- 抽象：`src/server/storage/index.ts` 暴露 `put/getUrl/delete`，当前实现 `LocalDiskStorage`，未来换 S3 只换这一个文件。
- 编辑器里上传后插入 `![alt](/uploads/xxx.png)`。

### 9.7 slug 生成规则

- `slug` 是**可选入参**：
  - 显式传入 → 校验 `^[a-z0-9]+(-[a-z0-9]+)*$`、长度 1–80、不含 `/`；与同分类下已有 slug 或同级子分类 slug 冲突时返回 **409 + 已占用的 slug 列表**，让调用方改。
  - 未传入 → 由标题自动生成：标题为 ASCII 时直接 kebab-case；标题含中文时用 `pinyin` 包转写（`用 MCP 装上发布能力` → `yong-mcp-zhuang-shang-fa-bu-neng-li`）；若转写结果为空或仍冲突，追加 `-<base36 随机后缀>`。
- 服务端**总是**返回最终 slug，MCP 工具的响应里必须包含它，Agent 据此拼 URL。

### 9.8 UI 双语

- 字典文件 `src/i18n/dictionaries/zh.ts` / `en.ts`，类型共享（`en.ts` 为 `typeof zh.ts`）。
- locale 来自 cookie（`terrawiki_locale`），无 cookie 时看 `Accept-Language`，默认 `zh`。
- Server Component 里读取，通过 `t('key')` 取用。
- `<html lang>` 随 locale 变化。
- **URL 不带 locale 前缀**；locale 切换器写在顶栏。

### 9.9 暗色模式

- `next-themes`，`attribute="class"`，默认跟随系统。
- 暗色下 Shiki 输出**两套** token 样式（CSS 变量），由 `.dark` 切换，不重新高亮。
- 令牌以 CSS 变量定义在 `globals.css` 的 `@theme inline` 里，Tailwind v4 直接引用 `bg-paper` / `text-ink` / `border-rule`。

### 9.10 Docker 与测试

**`Dockerfile`（多阶段）**
1. `deps`：`pnpm install --frozen-lockfile`
2. `builder`：`pnpm build`（`output: 'standalone'`）
3. `runner`：**`node:24-slim`**，拷贝 standalone + 静态资源 + public，非 root 用户运行，暴露 3000。

**`docker-compose.yml`**
- `db`：`postgres:17-alpine`，volume `pgdata`，健康检查 `pg_isready`
- `migrate`：一次性服务，跑 `pnpm drizzle-kit migrate` 后退出
- `app`：build `.`，ports `3000:3000`，depends_on `migrate` 完成、db healthy，volumes `uploads:/app/uploads`
- 卷：`pgdata`、`uploads`

**`docker-compose.test.yml`**：单独一个 `postgres:17-alpine` 服务（独立端口和库名），供 vitest 使用。**不用 pg-mem**——`pg_trgm` 和 partial index 在 pg-mem 上不可用。

---

## 10. 目录结构

```
terra-wiki/
├─ src/
│  ├─ app/
│  │  ├─ (public)/
│  │  │  ├─ page.tsx                  # 首页
│  │  │  ├─ [...segments]/page.tsx    # ★ 唯一 catch-all：分类页 / 文章页 / 标签过滤
│  │  │  ├─ tags/page.tsx, tags/[slug]/page.tsx
│  │  │  ├─ search/page.tsx
│  │  │  └─ sitemap/page.tsx
│  │  ├─ admin/                       # layout 里做权限门
│  │  ├─ api/mcp/route.ts
│  │  ├─ api/track/route.ts
│  │  ├─ api/auth/{login,logout}/route.ts
│  │  ├─ uploads/[...path]/route.ts
│  │  ├─ login/page.tsx
│  │  ├─ layout.tsx, globals.css
│  │  └─ sitemap.ts, robots.ts
│  ├─ components/
│  │  ├─ ui/                          # shadcn 生成物
│  │  ├─ layout/{TopBar,CategoryTree,ThemeToggle,LocaleToggle}.tsx
│  │  ├─ article/{Markdown,CodePane,TableOfContents,MetaLine}.tsx
│  │  └─ admin/{PostTable,MarkdownEditor,CategoryTreeEditor,MediaPicker,TokenList}.tsx
│  ├─ server/
│  │  ├─ db/{schema.ts,client.ts}
│  │  ├─ services/*.ts                # ← 唯一的业务逻辑所在
│  │  ├─ storage/{index.ts,local-disk.ts}
│  │  ├─ auth/{session.ts,password.ts}
│  │  ├─ markdown/{render.tsx,shiki.ts,toc.ts}
│  │  ├─ slug.ts
│  │  └─ audit.ts
│  ├─ mcp/
│  │  ├─ server.ts                    # MCP server 组装
│  │  └─ tools.ts                     # 工具定义（只做解析 + 转发）
│  ├─ i18n/{index.ts,dictionaries/{zh,en}.ts}
│  └─ lib/{utils.ts}
├─ mcp/stdio-bridge.mjs
├─ drizzle/                           # 迁移文件
├─ public/
├─ docs/superpowers/specs/
├─ Dockerfile, docker-compose.yml, docker-compose.test.yml, .env.example
└─ package.json, pnpm-lock.yaml
```

---

## 11. 验收标准

### 功能

- [ ] `/{分类路径}/{文章slug}` 可访问，文章只在其所属分类**子树**内出现
- [ ] 分类页不出现该分类子树之外的文章
- [ ] 同分类下 slug 冲突被拦截，返回明确错误；文章 slug 与同级子分类 slug 冲突同样被拦截
- [ ] 分类改 slug 或移动后，旧 URL 301 到新 URL，且批量写在同一事务里
- [ ] 文章可打多个标签；文章页点标签跳到 `/{分类路径}?tag={slug}`；`/tags/{slug}` 跨分类聚合
- [ ] 中文搜索"索引"能命中标题"索引"，英文搜索能命中正文
- [ ] 代码块渲染为深色窗格，带文件名和复制按钮，暗色模式下切换到深色主题
- [ ] 文章页右侧目录随滚动高亮当前小节
- [ ] 移动端代码块横向滚动不撑破布局
- [ ] 编辑器预览与服务端渲染结果一致（复用同一个渲染器）
- [ ] MCP `create_post` 传不存在的分类 → 报错并列出可用分类
- [ ] MCP `create_post` 传新标签 → 自动创建标签
- [ ] MCP `create_post` / `update_post` 传 `status` → 参数校验拒绝
- [ ] MCP `publish_post` 在 token 无 `can_publish` 时被拒绝
- [ ] MCP 读工具看不到他人草稿
- [ ] MCP `create_post` 只产出草稿时，后台草稿箱能看到，且审计日志 actor = token 名
- [ ] 本地 stdio 桥接脚本能让 Claude Code 调用 `list_posts`
- [ ] 后台改标题后，MCP `get_post` 立即返回新标题
- [ ] 每次内容保存产生一条 revision，可回退；状态流转不进 revision，只进审计日志
- [ ] 上传图片后 `/uploads/...` 可访问，编辑器插入 Markdown；SVG 被拒绝
- [ ] 浏览量按天分桶累加，同一访客同一天只计一次
- [ ] 切换语言后界面文案变化，URL 不变
- [ ] 暗色模式跟随系统，可手动覆盖
- [ ] RSS 含已发布文章，Sitemap 覆盖所有分类页和文章页
- [ ] `docker compose up` 后，网站、后台、MCP 端点全部可用
- [ ] MCP `create_category` 能建分类；slug 非法或撞保留字时被拒
- [ ] MCP `rename_category` / `move_category` 后，旧 URL 301 到新 URL
- [ ] MCP `merge_tags` / `restore_revision` / `delete_media` 可用，且行为与后台一致
- [ ] 新签发的 Token `can_publish=false`；显式勾选后 `publish_post` 才成功
- [ ] MCP 不暴露任何平台管理工具（成员 / Token / 设置 / 审计）

### 质量

- [ ] TypeScript strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`，无 `any`
- [ ] `pnpm build` 无警告失败
- [ ] `pnpm test`（vitest，对着 docker-compose.test.yml 的 Postgres）通过，覆盖 service 层核心不变量：路由消歧顺序、slug 互斥、分类归属校验、token 权限、revision 触发条件、浏览量去重
- [ ] 关键页面 Lighthouse：性能/可访问性/最佳实践 ≥ 90（生产构建，本地）
- [ ] 所有交互元素有可见焦点态；`prefers-reduced-motion` 被尊重
- [ ] 无 TODO / FIXME / 调试代码残留

---

## 12. 已拍板的决定（实现者直接执行）

### 12.1 由作者在本次会话中决定

1. 后台形态：策展台 + 轻量 Markdown 编辑器（§4.1）。
2. 账号模型：多作者，公开阅读，admin/author 两档角色（§4.2）。
3. 分类隔离：树形分类，一篇文章一个叶子，URL `/{分类路径}/{slug}`（§4.3）。
4. MCP 形态：HTTP 为唯一真相来源 + stdio 桥接，Agent 只在本机跑（§4.4）。
5. 多语言范围：仅 UI（§4.5）。
6. 视觉方向：「工程手册」+ 文件树式分类导航（§4.6、§5）。
7. 范围：包含图片上传、UI 多语、浏览量统计、暗色模式；排除评论/点赞/富文本/邮件/外部搜索引擎/自定义主题/per-post 翻译/图像处理/多租户。
8. MCP 工具集与后台能力对齐，平台管理除外（Q1=B）；发布需人工批准、Token 默认无发布权（Q2=A）。

### 12.2 由我在实现细节上拍板

9. **自研 session**，不引入 Auth.js（§9.1）。
10. **不建 REST API 层**，后台用 Server Actions，MCP 走工具（§7.3）。
11. **鉴权放 admin layout**，`proxy.ts` 只做 cookie 存在性判断（§9.1）。
12. **单一 catch-all + 固定解析顺序**；同级 slug 互斥保证消歧（§7.1、§6）。
13. **分类树用 `path` 物化路径**（text + 应用层维护），不用 `ltree`（§6）。
14. **Markdown 不解析原始 HTML**（不开 `rehype-raw`）（§9.4）。
15. **状态变更只走三个专用 MCP 工具**，`create/update_post` 不接受 `status`（§8.2）。
16. **`can_publish` 只约束 Token**，人类作者可直接在后台发布自己的文章；Token 侧该校验是硬边界（§8.2、§8.5）。
17. **文章状态机** `draft/published/archived`，无定时发布（§3）。
18. **Shiki 双主题**走 CSS 变量，客户端不重渲染（§9.9）。
19. **编辑器预览走 Server Action**，复用服务端渲染器（§9.4）。
20. **保留字列表**见 §7.1，顶级分类 slug 校验时拒绝（§7.1）。
21. **删除即软删**：文章用 `archived`；分类只允许删空分类（§8.2、§9.3）。
22. **v1 支持分类改名与移动**，批量 301 在同一事务内（§9.3）。
23. **revision 只在内容字段变化时写**；状态流转只进审计日志；回滚只恢复 title/summary/body_md，tags/category/status 保持当前值（§6、§11）。
24. **slug 可选入参**，缺省自动生成（中文走 pinyin），冲突返回 409 + 已占用列表（§9.7）。
25. **MCP 读可见范围与人类后台一致**：他人草稿只有 admin 可见（§8.5）。
26. **浏览量去重用 `post_view_visitors` 表**，`vid` 存 hash 不存 UUID（§6、§9.5）。
27. **搜索给 body_md 也建 trigram 索引**；接受 <3 字符查询走全表扫，规模前提是文章数 < 5 万（§9.2）。
28. **限流用进程内内存 LRU**（单机部署够用）（§9.5）。
29. **SVG 一律拒绝上传**；文件名由服务端生成（§9.6）。
30. **基础镜像 `node:24-slim`**，避免 musl 原生模块问题（§3、§9.10）。
31. **顶级分类 slug 用 partial unique index** 兜底（§6）。
32. **测试用真实 Postgres 容器**，不用 pg-mem（§9.10）。
33. **分类页聚合该分类子树**；列表分页 20 条/页（§5.4、§7.1）。
34. **首页 = 最近更新流 + 置顶 + 分类快捷入口**（§5.4）。
35. **界面文案统一主动语态、句首大写、无填充词**，中英两版都写（§9.8）。
36. **Docker 镜像非 root 运行**，compose 提供 `pgdata` 与 `uploads` 两个卷（§9.10）。
37. **MCP 工具集与后台能力逐操作对齐**（Q1=B）：治理型操作（建分类、改名/移动/删除分类、合并/重命名标签、删除媒体、回滚 revision）全部注册为 MCP 工具，按**归属作者的角色**判权——作者角色的 Token 做不到的事，后台里的作者也做不到（§8.5）。
38. **Agent 可以建分类**（Q1=B 的直接后果，推翻早先"Agent 不可建分类"的决定）。两道护栏：① 必须显式传 slug，格式与保留字校验同 §7.1；② 分类树的任何变更都进审计日志；新分类默认为空。
39. **发布审批（Q2=A）**：新签发的 Token 默认 `can_publish=false`，只能产出草稿；管理员在 `/admin/tokens` 签发时显式勾选才允许直发。人在后台点"发布"不受此限制。
40. **平台管理能力不对 MCP 开放**：成员管理、Token 签发、站点设置、审计日志查询。理由：Agent 给自己签发 Token 属于权限提升，这是唯一保留的通道差异。
41. **状态变更仍然只有 `publish_post` / `unpublish_post` / `archive_post` 三个入口**，不因 Q1=B 而放开 `create_post` / `update_post` 的 `status` 字段——这是 `can_publish` 的硬边界。

### 12.3 实现时可能微调、不必再找人确认

- `pg_trgm` 的具体权重、`ILIKE` 的回退阈值。
- 目录锚点的高亮阈值（IntersectionObserver 的 `rootMargin`）。
- 迁移脚本的具体切分粒度。
- 上传目录的子目录分片规则（按 `YYYY/MM`）。
- pinyin 转写库的具体选型。

---

## 13. 风险与对策

| 风险 | 影响 | 对策 |
|---|---|---|
| Shiki 在 Server Component 里同步高亮，首屏变慢 | 性能 | Shiki 只在服务端跑，只对 code fence 走；高亮结果进进程内 LRU 缓存 |
| 嵌套分类 + 批量 301 的实现复杂度被低估 | 工期 | 全部集中在 `categories.ts` 的一个事务函数里；v1 不做分类合并 |
| 多作者同时编辑同一篇 | 冲突 | 不做实时协作；保存时用 `updated_at` 乐观锁，冲突时提示并展示差异 |
| Agent 批量发布导致垃圾内容 | 内容质量 | Token 默认 `can_publish=false`；草稿箱 + 审计日志；发布审核见 Q2 |
| 中文搜索质量不佳 | 体验 | 短词走全表扫，规模前提已写明；不引入分词扩展 |
| 单机 Docker，Postgres 数据卷误删 | 数据丢失 | compose volume 命名明确，README 写备份命令 |
| `argon2` 原生模块在 slim 镜像下的兼容性 | 启动失败 | 基础镜像用 `node:24-slim` 而非 alpine；启动时做一次自检 |
| Agent 现在能建分类，命名空间可能被污染 | 内容质量 | 建分类必须显式传 slug（kebab-case + 保留字校验），不猜；分类树变更全进审计日志；后台分类树页可一眼看出结构变化，便于清理 |
