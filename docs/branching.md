# 分支模型与工作流

Terra-Wiki 用 gitflow 的三段式结构：`main` 放可发布的东西，`develop` 放正在集成的东西，功能分支从 `develop` 切出来。这份文档是操作手册；AGENTS.md 的「分支模型与工作流」章节是同一套规则的浓缩版，两者冲突时以 AGENTS.md 为准。

## 分支一览

| 分支 | 作用 | 谁往里合 | 部署 |
| --- | --- | --- | --- |
| `main` | 生产分支。每个提交都对应线上可运行的状态 | 只接受 `release/*` 与 `hotfix/*` 的合并 | 是 |
| `develop` | 集成分支。日常合并的目标，所有已验证的功能先聚到这里 | `feature/*`、`bugfix/*`、`chore/*`、`release/*`、`hotfix/*` | 否（可选的预发部署） |
| `feature/<name>` | 新功能 / 新页面 / 新 MCP 工具 | 从 `develop` 切出，合回 `develop` | 否 |
| `bugfix/<name>` | 缺陷修复。流程与 feature 完全一致，只是命名区分意图 | 从 `develop` 切出，合回 `develop` | 否 |
| `chore/<name>` | 依赖升级、构建与配置调整、文档 | 从 `develop` 切出，合回 `develop` | 否 |
| `release/<version>` | 发布准备。从 `develop` 切出，只放发布前的修补 | 合回 `develop`（回灌）与 `main`（发布） | `main` 部署 |
| `hotfix/<version>` | 线上紧急修复。从 `main` 切出 | 合回 `main`（发布）与 `develop`（回灌） | `main` 部署 |

结构图：

```
main        A---M---●---M2------●  (每次发布/热修一个合并节点)
            /     /            /
develop    D---o--o---o---M1---/------  (日常集成的线性历史)
          /    /   /   /
        feature  bugfix  chore   (从 develop 切出，合回 develop)
```

两条铁律：

1. **功能分支一律从 `develop` 切出、一律合回 `develop`。** 任何功能分支都不直接进 `main`。
2. **只有 `release/*` 与 `hotfix/*` 能进 `main`。** 这两条分支本身也从 `develop`（release）或 `main`（hotfix）切出。

## 命名规范

```
<type>/<short-kebab-description>
```

- `type` ∈ `feature` | `bugfix` | `chore` | `release` | `hotfix`
- 描述用小写短横线，不要中文，不要空格：`feature/admin-post-editor`、`bugfix/theme-toggle-resolved-theme`
- `release/` 与 `hotfix/` 的后半段是版本号，不带 `v`：`release/0.2.0`、`hotfix/0.1.1`
- 历史上用过 `feat/terra-wiki` 这类命名，分支已合并进 `main`，保留不改名；**新分支一律用上表的前缀**

## 常规开发流程

```bash
# 1. 从最新的 develop 切出功能分支
git switch develop
git pull --ff-only
git switch -c feature/admin-post-editor

# 2. 开发、自测
docker compose -f docker-compose.dev.yml up -d
pnpm typecheck && pnpm test

# 3. 提交（一次提交只做一件事）
git add -A
git commit -m "feat(admin): add the revision list to the post editor"

# 4. 开 PR：feature/admin-post-editor → develop
git push -u origin feature/admin-post-editor
gh pr create --base develop --head feature/admin-post-editor

# 5. CI 绿 + review 通过后合并，删分支
gh pr merge --squash --delete-branch
```

分支切出后 `develop` 前进时，如果你的分支还没合：

```bash
git switch feature/admin-post-editor
git rebase develop     # 或 git merge develop，二者选一，团队内保持一致
```

`main` 与 `develop` 都不接受直接 push，只接受 PR 合并（保护规则见文末）。

## 发布流程

版本号用语义化版本 `MAJOR.MINOR.PATCH`，与 `package.json` 的 `version` 保持一致。

```bash
# 1. 从 develop 切出发布分支
git switch develop
git pull --ff-only
git switch -c release/0.2.0

# 2. 只做发布前的修补（文案、依赖、迁移修补），并把版本号写进 package.json
#    pnpm db:generate 生成的迁移要在这一步定稿

# 3. 跑完整验证
pnpm typecheck && pnpm test

# 4. 合回 develop（回灌），再合进 main（发布）
git switch develop && git merge --no-ff release/0.2.0
git switch main && git merge --no-ff release/0.2.0

# 5. 打 tag（只在 main 上打）
git tag -a v0.2.0 -m "Terra-Wiki 0.2.0"
git push origin main --tags
```

push tag 会触发 `.github/workflows/release-image.yml`，自动构建镜像并推送到
`ghcr.io/jeffreyzhu0201/terra-wiki:release-<version>`；服务器端升级见 `docs/operations.md`。

服务器部署不再走源码构建，直接拉 CI 产出的镜像：

```bash
git pull
docker compose pull app
docker compose up -d
```

app 容器启动时自动跑数据库迁移（`scripts/migrate.mjs`），迁移失败则容器起不来、
旧容器继续跑，不会出现「新代码配旧库」的中间状态。

数据库迁移不会自动回滚，回滚步骤见 `docs/operations.md`。

## 热修流程

线上出问题时，从 `main` 切 hotfix，而不是从 `develop`——`develop` 上可能有还没验证的功能。

```bash
# 1. 从 main 切出热修分支
git switch main
git pull --ff-only
git switch -c hotfix/0.1.1

# 2. 修复 + 验证（改动面越小越好，必要时补一条回归测试）
pnpm typecheck && pnpm test

# 3. 同时合回 main 与 develop
git switch main && git merge --no-ff hotfix/0.1.1
git switch develop && git merge --no-ff hotfix/0.1.1

# 4. 打 tag
git tag -a v0.1.1 -m "Terra-Wiki 0.1.1"
git push origin main develop --tags
```

热修分支不要引入新的功能或依赖升级，只修那一个 bug。

## 提交规范

沿用 Conventional Commits，与仓库既有历史一致：

```
<type>(<scope>): <subject>

<body：为什么这么改，不是改了什么>
```

- `type`：`feat` | `fix` | `chore` | `docs` | `test` | `refactor` | `perf` | `build` | `ci`
- `scope`：模块名，取自代码结构——`auth`、`posts`、`categories`、`tags`、`media`、`mcp`、`admin`、`public`、`services`、`db`、`docker`、`ui`、`markdown`、`uploads`、`users`
- `subject`：祈使句、动词开头、不超过 72 字符、结尾不加句号
- 破坏性变更在 body 里加 `BREAKING CHANGE: <说明>`
- **一次提交只做一件事**：重构与功能不要混在一次提交里

示例：

```
feat(mcp): add the post revision tools

后台需要按版本比对文章改动，先补齐 MCP 侧的读取能力。
```

## 分支保护规则

仓库侧无法用文件强制保护规则，需要在 GitHub 设置里配置一次。下面的命令可以直接执行（需要 `gh` 已登录且对仓库有 admin 权限）。

`main` 与 `develop` 都要求：必须走 PR、CI 必须通过、禁止 force push、禁止删除、合并后自动删源分支；`main` 额外要求线性历史并要求至少 1 个 approve。

```bash
# 允许合并后自动删除源分支
gh api -X PUT repos/:owner/:repo -F delete_branch_on_merge=true

# main：严格保护
gh api -X PUT repos/:owner/:repo/branches/main/protection --input - <<'JSON'
{
  "required_status_checks": { "strict": true, "contexts": ["verify"] },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": false,
    "required_approving_review_count": 1
  },
  "restrictions": null,
  "required_linear_history": true,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "block_creations": false,
  "required_conversation_resolution": true
}
JSON

# develop：同上，但不强制线性历史（release/hotfix 回灌会产生合并节点）
gh api -X PUT repos/:owner/:repo/branches/develop/protection --input - <<'JSON'
{
  "required_status_checks": { "strict": true, "contexts": ["verify"] },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": false,
    "required_approving_review_count": 1
  },
  "restrictions": null,
  "required_linear_history": false,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "block_creations": false,
  "required_conversation_resolution": true
}
JSON
```

`verify` 是 CI workflow（`.github/workflows/ci.yml`）里的 job 名。改 job 名时，contexts 里的名字要同步改，否则 PR 会一直卡在「等待检查」。

如果暂时不想启用保护规则，先用下面这条确认规则是否已生效：

```bash
gh api repos/:owner/:repo/branches/main/protection
```
