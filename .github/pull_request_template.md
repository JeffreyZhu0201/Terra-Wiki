## 变更类型

<!-- 勾选一项：feature / bugfix / chore / docs -->

- [ ] feature（新功能）
- [ ] bugfix（缺陷修复）
- [ ] chore（依赖、构建、配置）
- [ ] docs（文档）

## 关联

<!-- issue 编号，或「无」 -->

Closes #

## 变更摘要

<!-- 一两句说清改了什么、为什么。 -->

## 验证

<!-- 「完成的定义」：typecheck 与 test 全过。在下面贴命令与结果摘要。 -->

- [ ] `pnpm typecheck` 通过
- [ ] `pnpm test` 通过
- [ ] 手动验证方式（若涉及 UI 或接口）：

```
（粘贴命令与输出）
```

## 数据库迁移

- [ ] 无迁移
- [ ] 有迁移：`pnpm db:generate` 新增了 `drizzle/` 下的 SQL 文件，文件名：

> 迁移 SQL 由 drizzle-kit generate 生成，不手写。发布顺序见 docs/operations.md。

## 影响面

- [ ] 无破坏性变更
- [ ] 有破坏性变更（接口签名 / 数据结构 / 配置项），回滚方式：

> 涉及 `src/server/db/schema.ts` 变更的迁移**不会自动回滚**，需人工处理，见 docs/operations.md。

## 分支

<!-- 本 PR 的源分支，命名见 docs/branching.md -->

源分支：`feature/`
目标分支：`develop`
