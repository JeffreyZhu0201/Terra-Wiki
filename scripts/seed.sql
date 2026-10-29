-- 演示数据：跑 `docker compose -f docker-compose.test.yml exec -T db-test psql -U terra -d terra_test -f /dev/stdin < scripts/seed.sql`
-- 幂等：重复执行不会重复插入。

INSERT INTO users (id, email, password_hash, name, role)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  'seed@example.com',
  '$argon2id$v=19$m=19456,t=2,p=1$xdNxKKPEzzk0ufwgZOKcpg$bn4FVqO9xQiGzxhj6ulkcu7oO5KpTSDtnlRm8z+Sfsw',
  '演示作者',
  'admin'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO categories (id, parent_id, slug, name, description, position, path, depth)
VALUES
  ('22222222-2222-2222-2222-222222222222', NULL, 'guide', '指南', '分类即独立空间', 0, 'guide', 0),
  ('33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', 'rust', 'Rust', 'Rust 相关', 0, 'guide/rust', 1),
  ('77777777-7777-7777-7777-777777777777', NULL, 'notes', '随笔', '不成体系的碎片', 1, 'notes', 0)
ON CONFLICT (id) DO NOTHING;

INSERT INTO tags (id, slug, name)
VALUES ('44444444-4444-4444-4444-444444444444', 'mcp', 'MCP')
ON CONFLICT (id) DO NOTHING;

INSERT INTO posts (id, category_id, slug, title, summary, body_md, status, author_id, featured, published_at, created_at, updated_at)
VALUES
  (
    '55555555-5555-5555-5555-555555555555',
    '33333333-3333-3333-3333-333333333333',
    'install-mcp',
    '用 MCP 装上发布能力',
    '十分钟把 Terra-Wiki 接进你的 Agent。',
    E'## 准备\n\n先在后台签发一个 Token，默认没有发布权。\n\n```ts title="mcp/stdio-bridge.mjs"\nconst url = process.env.MCP_HTTP_URL\n```\n\n### 安装\n\n```bash\npnpm add -g @modelcontextprotocol/sdk\n```\n\n## 配置\n\n写好 `mcp.json` 就能用了。',
    'published', '11111111-1111-1111-1111-111111111111', true, now(), now(), now()
  ),
  (
    '66666666-6666-6666-6666-666666666666',
    '33333333-3333-3333-3333-333333333333',
    'why-isolate',
    '为什么分类要隔离',
    '一篇讲清楚隔离的必要性。',
    E'## 隔离\n\n分类是硬边界，一篇文章只属于一个分类叶子。\n\n> 分类页里不会出现别的分类的文章。\n\n## 标签\n\n标签是横向索引，不破坏隔离。',
    'published', '11111111-1111-1111-1111-111111111111', false, now(), now(), now()
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO post_tags (post_id, tag_id)
VALUES ('55555555-5555-5555-5555-555555555555', '44444444-4444-4444-4444-444444444444')
ON CONFLICT DO NOTHING;
