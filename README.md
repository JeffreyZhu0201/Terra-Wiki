# Terra-Wiki

面向程序员的技术文档站。**分类即独立空间**——一篇文章只属于一个分类叶子，
分类页里不会出现别的分类的文章。Agent 通过 MCP 直接发布内容，人在 `/admin` 做策展。

## 状态

实现进行中。设计规格与实施计划：

- 规格：`docs/superpowers/specs/2026-10-29-terra-wiki-design.md`
- 计划：`docs/superpowers/plans/2026-10-29-terra-wiki.md`

## 技术栈

Next.js 16 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS v4 + shadcn/ui ·
PostgreSQL 17 + Drizzle ORM · Shiki · @modelcontextprotocol/sdk

## 本地开发

```bash
pnpm install

# 起测试库（端口 55432）
docker compose -f docker-compose.test.yml up -d

pnpm test        # 跑测试
pnpm typecheck   # 类型检查
pnpm dev         # 开发服务器
```

环境变量见 `.env.example`。首次启动需要 `BOOTSTRAP_ADMIN_EMAIL` 与
`BOOTSTRAP_ADMIN_PASSWORD` 来创建第一个管理员。

## 部署

```bash
cp .env.example .env    # 填好密码与密钥
docker compose up -d
```

完整说明（MCP 接入、备份、升级）见 `README.md` 的后续章节与 `docs/operations.md`。
