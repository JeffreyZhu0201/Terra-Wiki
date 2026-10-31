# 环境与模式

本地开发、打包、正式启动三者的区别。新成员先读这篇,再动手。

## 总览

| | 本地开发 | 打包(构建镜像) | 正式启动 |
| --- | --- | --- | --- |
| 命令 | `pnpm dev` + `docker-compose.dev.yml` | `docker build --target runner .` | `git pull && docker compose build && docker compose up -d` |
| 代码来源 | 本地源码,改了立即生效 | **源码在构建时烧进镜像,之后改代码镜像不变** | 镜像,只读 |
| Next 运行方式 | dev server(按需编译、HMR 热更新) | `next build` 产出 standalone 产物 | `node server.js` 跑产物,无编译 |
| 数据库 | 本机 `localhost:5432`(dev 库)、`55432`(test 库) | 不涉及 | compose 内部 `db:5432`,带数据卷 |
| 迁移 | 手动 `pnpm db:migrate` | 打包只携带 `drizzle/` 文件 | **容器启动自动跑** `scripts/migrate.mjs` |
| 运行用户 | 自己 | 不涉及 | 非 root 的 `nextjs`(uid 1001) |
| 上传目录 | `./public/uploads`(.env) | 不涉及 | `uploads` 卷挂 `/app/uploads` |

## 本地开发:容器里只有数据库,应用裸跑 Node

```
你的终端: pnpm dev ──→ localhost:5432(db-dev 容器)
          pnpm test ─→ localhost:55432(db-test 容器)
```

- dev server 按需编译、改文件热更新,所以「改完代码刷新就生效」。
- 数据库和应用**不在一个网络**:应用走 `localhost:5432`,靠本机的端口转发落到容器。
  OrbStack 用户注意:若迁移「成功但没建表」,先确认 `localhost:5432` 实际落在哪个容器
  (`docker exec <db容器> psql -U terra -d terra -c '\dt'`)。
- `UPLOAD_DIR=./public/uploads`,传的文件直接落在源码目录里。

## 打包:一次性动作,产物是不可变镜像

Dockerfile 四个阶段:`deps`(只装依赖,缓存友好)→ `builder`(`pnpm build` 出
standalone)→ `runner`(只拷产物,约 470MB)。

- **源码打进镜像的那一刻就定格了**——这是「改完代码必须重建镜像才生效」的根本原因。
- 两个入口,动作相同:
  - 本机 `docker build --target runner .`:自测(验证镜像能否启动、迁移是否正常);
  - 服务器 `docker compose build`:正式部署的构建步骤,build 成功前旧容器照常跑。
- 打包不碰数据库,只把 `drizzle/` 迁移文件和 `scripts/migrate.mjs` 一起装进镜像,启动时才执行。

## 正式启动:一条命令拉起数据库 + 应用,迁移自动跑

```
docker compose up -d ─┬─ db(postgres:17, pgdata 卷,healthcheck)
                      └─ app(本地构建的镜像,等 db 健康后启动)
                            └─ 入口: node scripts/migrate.mjs && exec node server.js
```

- `DATABASE_URL` 由 compose 内部网络注入(`db:5432`),不用 localhost。
- 迁移和应用同生命周期:迁移失败容器直接退出并反复重启,不会「新代码配旧库」。
- 站点设置(`SITE_NAME` 等)只是出厂值,后台改过之后以数据库为准。

日常升级、备份、故障排查见 [operations.md](operations.md);发布流程见 [branching.md](branching.md)。

## 一句话记忆

**开发时容器里只有数据库;打包是把源码定格成镜像;生产是「在服务器上把最新源码定格成镜像 + 自带数据库,启动时自己迁表」。**
最容易踩的坑是改了代码忘了重建镜像——线上跑哪个版本看服务器 checkout 的 commit(`git log -1`),重建前线上永远是旧代码。
