/**
 * MCP 服务器的 instructions——随 initialize 响应下发给 Agent。
 *
 * 这里放的是**写入契约**：Agent 不读文档、不看后台，靠这段话知道
 * 哪些事该怎么做、哪些做了会失败。散落在各工具 description 里的
 * 约定集中到这里，Agent 一次就读全。
 *
 * 不是界面文案，不进 src/i18n/dictionaries/——那是给人看的界面用语，
 * 这里是给 Agent 看的协议说明。
 */
export const MCP_INSTRUCTIONS = `Terra-Wiki 是面向程序员的技术文档站。你在用 MCP 写内容，运营在后台策展。

写入前先知道这些：

1. 分类是一棵树，文章只能放在**叶子分类**下。create_post 传分类 id（不是路径），先用 list_categories 找到目标叶子分类的 id。传错时错误里会带 availableCategories，照着改即可。
2. 状态变更只有三个入口：publish_post / unpublish_post / archive_post。create_post 与 update_post 不接受 status 参数——不是漏了，是设计如此，绕过它没有好处。
3. 发布需要 Token 有 can_publish 权限；没有时 publish_post 会报"这个 Token 没有发布权限"。这是给人留的确认环节，不要绕。
4. 权限继承 Token 归属作者：作者角色的 Token 改不了别人的文章，也建不了分类（分类治理仅管理员可做）；管理员的 Token 可以。
5. 标签不存在会自动创建，不必先查。中文标题会转成拼音 slug（"冒烟测试" → mao-yan-ce-shi）。服务端总是返回最终 slug，拼 URL 用它。
6. 同一分类内 slug 唯一。改 slug 不会自动写 301 转发，谨慎使用。
7. update_post 的 tags 是最终集合；addTags / removeTags 做增删。传 expectedUpdatedAt 可做乐观锁——文章被别人改过时会报冲突而不是静默覆盖。
8. 读工具的可见范围与人类后台一致：他人的草稿不可见，list_revisions 只有作者本人与管理员能看到。看不到时报"文章不存在"而不是"没权限"。
9. 工具返回 JSON 文本。出错时 isError 为 true，message 说明原因，details 带上下文（如 availableCategories）。错误信息不要当成数据解析。

工具集 = 后台能力全集，减去平台管理：成员、Token 签发、站点设置、审计查询不对外开放。`
