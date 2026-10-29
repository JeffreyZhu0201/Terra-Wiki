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

恢复的是旧快照，迁移状态也可能比备份新——`migrate` 服务会在 app 启动前把库推到最新。

## 升级

```bash
git pull
docker compose build
docker compose up -d
```

顺序是固定的：**先 build 成功，再 up**。`up` 会重跑 `migrate` 服务，迁移失败时
app 不会启动（`service_completed_successfully`），旧容器继续跑，不会出现
"新代码配旧库"的中间状态。

回滚：把代码切回上一个版本，再 `docker compose build && docker compose up -d`。
数据库迁移不自动回滚——如果新迁移不兼容旧代码，先恢复备份。

## Token 轮换

Token 明文只在签发时显示一次，库里存的是 sha256，所以轮换就是"签新的、吊旧的"：

1. `/admin/tokens` → 签发新 Token，复制明文。
2. 更新 Agent 端的配置（`MCP_TOKEN`）。
3. 确认 Agent 能正常调用（`tools/list` 有响应）。
4. 回到 `/admin/tokens` → 吊销旧 Token。

先切新再吊旧，中间留一段两套 Token 都能用的窗口。

怀疑 Token 泄露时，直接吊销——吊销即刻生效，不等缓存过期。

## 常见故障

### 登录提示"缺少 BOOTSTRAP_ADMIN_EMAIL 或 BOOTSTRAP_ADMIN_PASSWORD"

首次登录时会创建初始管理员，缺这两个变量就建不出来。补上 `.env` 里的值再重启：

```bash
docker compose up -d --force-recreate app
```

### app 起不来，日志里是数据库连接错误

多半是 `migrate` 没跑成功。先看迁移日志：

```bash
docker compose logs migrate
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

`migrate` 服务用的是 `drizzle-kit migrate`，它只读 `drizzle/` 目录里的迁移文件。
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
