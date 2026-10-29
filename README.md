# Terra-Wiki

面向程序员的技术文档站。**分类即独立空间**——一篇文章只属于一个分类叶子，
分类页里不会出现别的分类的文章。Agent 通过 MCP 直接写内容，人在 `/admin` 做策展。

- 视觉方向：「工程手册」——浅色纸面、普鲁士蓝强调、深色代码窗格
- 界面双语（zh/en），URL 不带语言前缀
- 没有评论、点赞、富文本、邮件订阅、外部搜索引擎

## 快速开始（Docker）

```bash
cp .env.example .env
# 编辑 .env：至少填 BOOTSTRAP_ADMIN_EMAIL / BOOTSTRAP_ADMIN_PASSWORD
docker compose up -d
```

`docker compose up` 会依次完成三件事：起 PostgreSQL 17 → 跑数据库迁移 → 启动应用。
第一次登录用 `.env` 里的管理员账号，地址 <http://localhost:3000/admin>。

## 本地开发

```bash
pnpm install
docker compose -f docker-compose.test.yml up -d   # 测试库，端口 55432
DATABASE_URL=postgres://terra:terra@localhost:55432/terra_test pnpm db:migrate
pnpm dev                                          # http://localhost:3000
```

| 命令 | 作用 |
| --- | --- |
| `pnpm dev` | 开发服务器 |
| `pnpm test` | 跑测试（需要 `TEST_DATABASE_URL` 指向的库） |
| `pnpm typecheck` | TypeScript 类型检查 |
| `pnpm build` | 生产构建 |
| `pnpm db:generate` / `pnpm db:migrate` | 生成 / 执行迁移 |

## MCP 接入

Agent 在自己的会话里建分类、写文章、发布，不用打开浏览器。

### 1. 签发 Token

登录后台 → `/admin/tokens` → 签发。**明文只显示这一次**，关掉就再也拿不回来
（库里只存 sha256）。新签发的 Token 默认没有发布权——`publish_post` 会被拒绝，
需要人工在后台点发布。要让 Agent 直接发布，签发时勾上「允许直接发布」。

### 2. 配置客户端

Agent 只说 stdio 协议时用仓库里的桥接脚本：

```json
{
  "mcpServers": {
    "terra-wiki": {
      "command": "node",
      "args": ["/绝对路径/terra-wiki/mcp/stdio-bridge.mjs"],
      "env": {
        "MCP_HTTP_URL": "http://localhost:3000/api/mcp",
        "MCP_TOKEN": "<从 /admin/tokens 复制>"
      }
    }
  }
}
```

客户端支持 HTTP 的话直接连 `http://localhost:3000/api/mcp`，带上
`Authorization: Bearer <token>` 即可，不需要桥接脚本。

### 3. 工具集（22 个）

| 类别 | 工具 |
| --- | --- |
| 读 | `list_categories` `list_tags` `list_posts` `get_post` `search_posts` `list_media` `list_revisions` |
| 写 | `create_post` `update_post` `publish_post` `unpublish_post` `archive_post` `create_tag` `rename_tag` `merge_tags` `delete_media` `restore_revision` `upload_image` `create_category` `rename_category` `move_category` `delete_category` |

几条要记住的规则：

- **`create_post` 的分类必须是已存在的叶子分类**（给 id，不是路径）。传错了会报错，
  错误里会列出当前可用的分类，Agent 照着改就能继续。
- **状态变更只有 `publish_post` / `unpublish_post` / `archive_post` 三个入口**。
  `create_post` / `update_post` 不接受 `status` 参数，传了会被参数校验拒绝。
- **平台管理不对 Agent 开放**：成员、Token 签发、站点设置、审计查询都没有对应工具——
  Agent 给自己签发 Token 属于权限提升。
- **权限继承 Token 归属作者**：作者角色的 Token 改不了别人的文章，也建不了分类；
  管理员的 Token 可以。
- `upload_image` 收 base64 编码的图片内容，返回可直接插入 Markdown 的地址。
- 中文标签、文章标题会转成拼音 slug（`冒烟测试` → `mao-yan-ce-shi`）。

## 安全说明

- Markdown 不解析原始 HTML：走 `remark-parse → remark-rehype`，HTML 标签被丢弃。
- 上传只接受 png / jpeg / webp / gif，按**文件头**判断，扩展名和 MIME 都能伪造，
  文件头不会。SVG 不收。
- Token 只存 sha256，吊销后即刻失效（不是等缓存过期）。
- 会话 cookie 是 HttpOnly + SameSite=Lax，30 天过期。
- 成员可以被停用：停用后立即无法登录，已有会话同时失效。

## 项目结构

```
src/
├─ app/
│  ├─ (public)/                 公开站点：首页 / 分类页 / 文章页 / 标签 / 搜索 / sitemap
│  │  └─ [...segments]/page.tsx ★ 唯一 catch-all：分类页、文章页、标签过滤
│  ├─ admin/                    后台：仪表盘 / 文章 / 分类 / 标签 / 媒体 / 成员 / Token / 审计 / 设置
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
│  └─ admin/                    后台组件：编辑器、文章表、分类树、媒体、Token
├─ server/
│  ├─ db/                       Drizzle schema 与连接
│  ├─ services/                 ← 唯一的业务逻辑所在
│  ├─ storage/                  本地磁盘存储
│  ├─ auth/                     密码与会话
│  ├─ markdown/                 渲染管线（unified + Shiki）
│  ├─ mcp/                      MCP 工具集与服务器组装
│  ├─ i18n/                     词典与语言解析
│  └─ audit.ts                  审计日志
├─ mcp/stdio-bridge.mjs         stdio → HTTP 桥接脚本
└─ drizzle/                     迁移文件
```

## 运维

备份、恢复、升级、Token 轮换见 [docs/operations.md](docs/operations.md)。
