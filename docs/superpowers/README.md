# Superpowers Docs Index

这份索引专门解决一个现实问题：`docs/superpowers/` 下面同时存在当前生效文档和大量历史设计/计划/验证记录。若不先分清楚状态，很容易被旧方案误导。

## 当前优先阅读

以下文档最接近当前项目实际状态，优先看它们：

- `README.md`
  - 项目当前能力、运行方式、测试脚本、目录说明
- `Product-Spec.md`（仓库上一级目录）
  - 当前产品需求与约束的主文档
- `Product-Spec-CHANGELOG.md`（仓库上一级目录）
  - 当前需求变更记录
- `docs/superpowers/specs/2026-04-08-unified-preview-source-highlighting-design.md`
  - 当前预览溯源闭环与非 PDF 块级高亮的主设计参考
- `DEVELOPMENT-WORKFLOW.md`
  - 当前开发流程约定与 worktree 使用说明

## 当前可执行测试入口

- `npm test`
  - 前端默认测试集
- `npm run test:frontend:stable`
  - 前端稳定测试入口（单 worker / 非 isolate）
- `npm run test:backend`
  - 当前后端删除一致性相关测试入口
- `npm run test:regression`
  - 当前关键前后端回归测试子集

## 历史设计（保留作背景，不是当前唯一依据）

- `docs/superpowers/specs/2026-04-05-document-preview-upgrade-design.md`
- `docs/superpowers/specs/2026-04-04-english-boundary-protection-design.md`
- `docs/superpowers/specs/2026-04-03-hot-reload-design.md`
- `docs/superpowers/specs/2026-04-01-settings-page-redesign-design.md`

这些文件主要用于回答：

- 当时为什么这么设计
- 哪些方案被探索过
- 后来哪些方向被回退或替换

## 历史计划（保留作演进记录，不再直接执行）

- `docs/superpowers/plans/2026-04-08-pdf-original-page-highlight.md`
- `docs/superpowers/plans/2026-04-08-unified-preview-source-highlighting.md`
- `docs/superpowers/plans/2026-04-05-document-preview-upgrade.md`
- `docs/superpowers/plans/2026-04-05-document-detail-and-chunking-optimization.md`
- `docs/superpowers/plans/2026-04-05-english-boundary-protection.md`
- `docs/superpowers/plans/2026-04-03-english-pdf-pipeline-hardening.md`
- `docs/superpowers/plans/2026-04-03-document-pipeline-orchestration.md`
- `docs/superpowers/plans/2026-04-02-settings-center-rearchitecture.md`
- `docs/superpowers/plans/2026-03-31-frontend-backend-split.md`

这些文档的用途是：

- 回溯曾经怎么拆任务
- 对照代码理解功能是分几轮落地的
- 不应再被当作“今天马上执行的唯一计划”

## 历史验证快照（保留作证据，不等于当前健康状态）

- `docs/superpowers/verification/2026-04-05-document-preview-upgrade.md`
- `docs/superpowers/verification/2026-04-05-document-detail-and-chunking-optimization.md`
- `docs/superpowers/verification/2026-04-05-english-boundary-protection.md`
- `docs/superpowers/verification/2026-04-03-english-pdf-pipeline-hardening.md`

这些文件的用途是：

- 证明某个历史阶段跑过哪些命令、当时通过了什么
- 不应替代当前回归结果

## 当前文档阅读顺序（推荐）

如果你要快速理解这个项目，现在按这个顺序看：

1. `README.md`
2. `Product-Spec.md`
3. `Product-Spec-CHANGELOG.md`
4. `docs/superpowers/specs/2026-04-08-unified-preview-source-highlighting-design.md`
5. 相关代码与当前测试

如果你要追历史：

1. 看对应 `specs/`
2. 再看对应 `plans/`
3. 最后看对应 `verification/`

## 维护规则

- 新需求或行为变化：先更新 `Product-Spec.md` / `Product-Spec-CHANGELOG.md`
- 当前仍有效的设计文档：直接更新原文
- 已废弃或已完成的设计/计划/验证：保留原文，补 `Status` 说明，不要伪装成当前状态
- 若后续文档继续增多，优先维护本索引，避免“文档都在，但没人知道该看哪份”
