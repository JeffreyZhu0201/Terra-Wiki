# MCP 工具扩充：delete_tag / get_post_views / get_publish_calendar

日期：2026-10-31 · 状态：已批准（会话内确认）

## 意图

Agent 工具集补齐两块缺口：标签管理缺「删」这最后一环；Agent 写内容时
拿不到任何数据参考（热度、发布节奏）。工具数 22 → 25。

## 目标 / 非目标

- 目标：`delete_tag`、`get_post_views`、`get_publish_calendar` 三个工具，
  语义与后台一致，配测试与 README 同步。
- 非目标：settings / users / tokens 依旧不开放（平台管理，防权限提升）；
  不加 `get_category` 单个（价值低）。

## 方案取舍

- **复用 service 已有实现**（选中）：`deleteTag` / `getViewCount` /
  `countPostsByDay` 都已存在且后台在用，MCP 只做包装。零业务逻辑新增。
- 在 views/posts service 里新写批量/聚合查询：`getViewCount` 没有批量版，
  但 50 个上限内逐个查询足够快，不值得为它加 service API。
- 只加统计或只加 delete_tag：都不完整，一次补齐成本相同。

## 工具定义

### delete_tag

- 入参 `{ tagId: string }`。
- 语义与后台一致：无条件删，文章关联随外键级联移除。
- 与 `create_tag` / `rename_tag` 同口径，不设 admin 门。
- 写审计 `tag.delete`（target type `tag`）。

### get_post_views

- 入参 `{ postIds: string[] }`，1–50 个（超上限报 `invalid`）。
- 返回 `[{ postId, views }]`，`views` 为累计浏览次数；不存在的 id 返回 0。
- 纯读，不写审计。

### get_publish_calendar

- 入参 `{ from?, to? }`，`YYYY-MM-DD`；省略时默认最近 90 天（to = 今天，
  from = to - 89 天）。范围上限 366 天。
- 复用 `countPostsByDay(from, toExclusive)`，只统计已发布文章
  （按 `published_at`）。
- 返回 `[{ day, count }]`，`day` 为 `YYYY-MM-DD`，升序，count 为 0 的天
  也返回（日历/节奏感知需要连续刻度）。

## 配套改动

- `src/mcp/tools.test.ts` 按现有模式补三个工具的测试。
- README 工具表同步（22 → 25）。
- `MCP_INSTRUCTIONS` 不动：三个工具不涉及既有写入契约。

## 留给实现的决定

- 0 计数的天是否返回：返回（见上），实现时保持。
- `get_post_views` 的逐个查询实现放在工具层循环，不动 service。
