# 运维手册

Terra-Wiki 的备份、恢复、升级、Token 轮换与故障排查。

## 数据在哪

| 数据 | 位置 | 说明 |
| --- | --- | --- |
| 文章、分类、标签、用户、Token、审计日志 | `pgdata` 卷（PostgreSQL） | 唯一的真相来源 |
| 上传的图片 | `uploads` 卷（容器内 `/app/uploads`） | 数据库里只存路径 |
| 配置 | `.env` 文件 | 不进容器，部署时自己保管 |

两个卷都是 Docker 命名卷，用 `docker volume ls` 能看到。

## 备份

```bash
# 数据库
docker compose exec -T db pg_dump -U terra terra > backup-$(date +%F).sql

# 上传的文件
docker run --rm -v terra-wiki_uploads:/data -v "$PWD":/backup alpine \
  tar czf /backup/uploads-$(date +%F).tar.gz -C /data .
```

两条命令都建议进定期任务。数据库备份不含图片，反过来也一样。

## 恢复

```bash
# 先停应用，避免恢复过程中有人往里写
docker compose stop app

# 恢复数据库
docker compose exec -T db psql -U terra -d terra < backup-2026-01-01.sql

# 恢复上传的文件
docker run --rm -v terra-wiki_uploads:/data -v "$PWD":/backup alpine \
  tar xzf /backup/uploads-2026-01-01.tar.gz -C /data

docker compose up -d
```

恢复的是旧快照，迁移状态也可能比备份新——app 启动时会自动把库迁到最新。

## 升级

从源码构建部署（见 `docs/branching.md` 的发布流程），顺序固定：**先 build 成功，再 up**。

```bash
git pull
docker compose build
docker compose up -d
```

`build` 失败不影响正在跑的旧容器；`up` 会让 app 容器先跑迁移（`scripts/migrate.mjs`）
再起服务。迁移失败时新容器起不来，`docker compose ps` 里能看到 app 反复重启——
先看 `docker compose logs app` 修迁移问题，或回滚，不要硬拉。

回滚：`git checkout <上一个 release 的 tag>`（或任意已知良好的 commit），
再走一遍 `build && up -d`。数据库迁移不自动回滚——如果新迁移不兼容旧代码，先恢复备份。

## Token 轮换

每个成员自带一枚 Token，明文存在 `mcp_tokens.token` 里，后台 `/admin/team`
点「复制 Token」即可取到。库里没有单独的签发/吊销界面，轮换直接改库：

```sql
-- 换成新的随机 Token（老 Token 立刻失效）
UPDATE mcp_tokens SET token = encode(sha256((random()::text || clock_timestamp()::text)::bytea), 'hex')
WHERE author_id = '<成员 id>';
```

改完把新值同步到 Agent 端配置（ZCode MCP 服务器里的 `Authorization` 请求头）。因为库里是明文，
换 Token 没有任何「只显示一次」的窗口——改库即刻生效。

怀疑 Token 泄露时，同样直接改库作废；成员被停用也会让其 Token 立刻失效
（Token 是独立于会话的一条通道）。

> 早期版本用 sha256 存 Token、另设 `/admin/tokens` 页签发与吊销。
> 那套已经拆掉：成员自带一枚 Token 后，签发与吊销的界面失去了意义。

## 常见故障

### 登录提示"缺少 BOOTSTRAP_ADMIN_EMAIL 或 BOOTSTRAP_ADMIN_PASSWORD"

首次登录时会创建初始管理员，缺这两个变量就建不出来。补上 `.env` 里的值再重启：

```bash
docker compose up -d --force-recreate app
```

### app 起不来，日志里是数据库连接错误

多半是启动迁移没跑成功。迁移就在 app 容器里跑，直接看它的日志：

```bash
docker compose logs app
docker compose logs db
```

### 端口 3000 被占用

改 `docker-compose.yml` 里 app 服务的端口映射，比如 `"3100:3000"`。

### 上传目录权限错误

容器里应用以非 root 用户 `nextjs`（uid 1001）运行，上传目录必须可写：

```bash
docker compose exec app ls -ld /app/uploads
```

卷的属主继承自镜像里的目录，通常没问题；如果手工改过，用
`docker compose up -d --force-recreate app` 重建容器。

### 图片能传但页面里 404

`UPLOAD_DIR` 必须和 `uploads` 卷的挂载点一致（compose 里是 `/app/uploads`）。
另外确认 `/uploads/...` 能访问——这是应用自己的路由，不是静态目录。

### 迁移报错但库是好的

容器启动时的迁移脚本（`scripts/migrate.mjs`）只读 `drizzle/` 目录里的迁移文件。
改了 schema 但没生成迁移文件，库就不会变：

```bash
pnpm db:generate && pnpm db:migrate   # 本地
```

## 日志

```bash
docker compose logs -f app
docker compose logs -f migrate
```

审计日志在后台 `/admin/audit`，能看到谁（人或 Token）在什么时候做了什么。
