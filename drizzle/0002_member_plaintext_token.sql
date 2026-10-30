-- Token 改为「成员自带、明文入库」：团队页要能随时复制，存哈希就拿不回来了。
ALTER TABLE "mcp_tokens" ADD COLUMN "token" text;

-- 存量 Token 补一个明文值（旧的哈希无法还原，只能重发）。
-- sha256 是 PG 11+ 内置函数，不依赖 pgcrypto 扩展。
UPDATE "mcp_tokens"
  SET "token" = encode(sha256((random()::text || clock_timestamp()::text)::bytea), 'hex')
  WHERE "token" IS NULL;

ALTER TABLE "mcp_tokens" ALTER COLUMN "token" SET NOT NULL;
ALTER TABLE "mcp_tokens" ADD CONSTRAINT "mcp_tokens_token_unique" UNIQUE("token");

-- 每个成员只保留最新一枚，多余的历史签发直接清掉。
DELETE FROM "mcp_tokens" a USING "mcp_tokens" b
  WHERE a."author_id" = b."author_id" AND a."created_at" < b."created_at";
DELETE FROM "mcp_tokens" a USING "mcp_tokens" b
  WHERE a."author_id" = b."author_id" AND a."created_at" = b."created_at" AND a."id" < b."id";

ALTER TABLE "mcp_tokens" ADD CONSTRAINT "mcp_tokens_author_id_unique" UNIQUE("author_id");

-- 每个成员都必须有一枚：给还没有 Token 的存量成员补签。
INSERT INTO "mcp_tokens" ("name", "token", "author_id")
  SELECT u."name",
         encode(sha256((random()::text || clock_timestamp()::text || u."id"::text)::bytea), 'hex'),
         u."id"
  FROM "users" u
  WHERE NOT EXISTS (SELECT 1 FROM "mcp_tokens" t WHERE t."author_id" = u."id");

ALTER TABLE "mcp_tokens" DROP CONSTRAINT IF EXISTS "mcp_tokens_token_hash_unique";
ALTER TABLE "mcp_tokens" DROP COLUMN IF EXISTS "token_hash";
