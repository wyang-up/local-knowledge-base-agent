# 标准开发流程（Main 保护分支模式）

这份文档是当前项目的默认开发 SOP。

目标很简单：

- 原则上不直接在 `main` 上开发
- 所有功能都通过功能分支 + PR 合并
- 尽量减少冲突，降低把脏改动带进主分支的概率

---

## 一、核心原则

1. `main` 只作为稳定主线，原则上不直接开发。
2. 每个新需求都从最新 `main` 切出一个新分支。
3. 所有代码修改、测试、提交都在功能分支完成。
4. 通过 PR 合并回 `main`，不要直接 push 到 `main`。
5. PR 合并完成后，删除对应功能分支。
6. 如果一个需求还没做完，不要复用旧功能分支继续堆新需求。

---

## 二、标准流程

### 1. 开始新需求

先同步主分支，再切出新分支：

```bash
git checkout main
git pull origin main
git checkout -b feature/<short-name>
```

命名建议：

- `feature/document-detail-redesign`
- `feature/chunk-metadata-enhancement`
- `fix/upload-error-feedback`
- `fix/pdf-reference-splitting`

不要使用这些命名：

- `test`
- `aaa`
- `new`
- `temp`
- `my-branch`

这种命名和没命名差不多，后面排查历史时只会恶心人。

---

### 2. 在功能分支开发

开发、测试、提交都在当前功能分支完成：

```bash
git status
```

开发过程中建议小步提交：

```bash
git add <files>
git commit -m "feat: add xxx"
```

常见提交前缀建议：

- `feat:` 新功能
- `fix:` bug 修复
- `docs:` 文档更新
- `test:` 测试补充或修正
- `refactor:` 重构（不改行为）
- `chore:` 杂项维护

---

### 3. 提交前自检

在发 PR 之前，至少做这些检查：

```bash
git status
npm test
npm run lint
```

如果项目不是全量测试都稳定，也至少要跑和当前需求强相关的测试。

原则：

- 不要在测试没过时开 PR
- 不要靠“应该没问题”去赌
- 不要把明显未完成的试验代码推上去污染审查

---

### 4. 推送功能分支

```bash
git push -u origin feature/<short-name>
```

只 push 当前功能分支，不要 push `main`。

---

### 5. 发起 PR

PR 的方向应该永远是：

- `feature/...` -> `main`

PR 描述至少写清楚：

1. 改了什么
2. 为什么改
3. 怎么验证
4. 是否有已知限制

---

### 6. PR 合并前同步主分支

如果 PR 开着期间 `main` 又进了新提交，先同步再处理：

```bash
git fetch origin
git checkout feature/<short-name>
git merge origin/main
```

如果没有冲突，继续测试。

如果有冲突，先解决冲突，再跑验证命令，再 push。

```bash
git add <resolved-files>
git commit
git push
```

---

### 7. PR 合并完成后收尾

PR 合并成功后：

```bash
git checkout main
git pull origin main
git branch -d feature/<short-name>
git push origin --delete feature/<short-name>
```

说明：

- `git branch -d` 删除本地分支
- `git push origin --delete ...` 删除远端分支

这样仓库不会堆一堆死分支。

---

## 三、推荐的 Worktree 流程

如果你主目录已经有未提交改动，或者想并行做多个需求，推荐用 worktree。

### 创建 worktree

```bash
git checkout main
git pull origin main
git worktree add .worktrees/feature-<short-name> -b feature/<short-name>
```

补充说明：

- 如果临时在 `main` 上做过修复或紧急提交，做完后应尽快恢复到分支 / PR 流程，不要把“例外”当成默认流程。
- `.worktrees/` 目录已被测试配置显式排除，避免隔离工作目录污染 Vitest 扫描结果。

例子：

```bash
git worktree add .worktrees/feature-detail-panel -b feature/detail-panel
```

### 进入 worktree 开发

```bash
cd .worktrees/feature-detail-panel
npm install
npm run dev
```

优点：

- 主目录不动
- 新需求在隔离目录里做
- 不用来回切分支
- 不容易把旧改动带进新需求

---

## 四、为什么开了 main 保护，还是会有冲突

因为：

- 分支保护解决的是“谁能直接改 `main`”
- 合并冲突解决的是“你的分支和 `main` 改了同一段代码”

所以即使 `main` 被保护：

1. 你在 `feature/a` 改了 `DocumentDetailPanel.tsx`
2. 别人在 `main` 也改了同一文件同一区域
3. 你发 PR 时，Git 发现两边都动了
4. 它不知道保留谁，就会冲突

这非常正常，不是保护失效。

---

## 五、如何减少冲突

1. PR 不要挂太久，功能做完尽快合并。
2. 大文件不要堆太多需求，一次只改一个主题。
3. 每天开始开发前先拉最新 `main`。
4. PR 合并前再同步一次 `origin/main`。
5. 尽量把大需求拆成多个 PR，而不是一个 PR 改十几件事。

---

## 六、禁止事项

以下行为默认禁止：

- 直接在 `main` 改代码
- 在 `main` 上直接提交
- 不跑测试就开 PR
- 一个功能分支上顺手塞另一个无关需求
- PR 合并后不删分支
- 发现冲突后直接乱选一边、不验证就 push

这些操作短期看省事，长期只会把仓库搞成垃圾场。

---

## 七、最短可执行版本

如果你只想记最短的一版，就记下面这 8 行：

```bash
git checkout main
git pull origin main
git checkout -b feature/<short-name>
# 开发代码
git add .
git commit -m "feat: ..."
git push -u origin feature/<short-name>
# 发 PR 到 main
```

合并后：

```bash
git checkout main
git pull origin main
git branch -d feature/<short-name>
git push origin --delete feature/<short-name>
```

---

## 八、建议的团队规则

如果你们要把这套流程固定下来，建议在 GitHub 上同时开启：

1. `Require a pull request before merging`
2. `Require status checks to pass before merging`
3. `Require branches to be up to date before merging`
4. `Include administrators`
5. `Do not allow bypassing the above settings`

这样这套流程才不是“建议”，而是“系统强制执行”。
