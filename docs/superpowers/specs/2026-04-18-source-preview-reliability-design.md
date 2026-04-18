# Source Preview Reliability Design

日期：2026-04-18
项目：`local-knowledge-base-agent`
范围：source 直达预览链路、PDF 分块与清洗一致性、前端定位可信性

## 1. 目标

这轮修复解决两个问题：

1. 当前 source 直达预览链路不完整，前后端字段不对齐，导致“结构化定位”大多退化成模糊文本匹配。
2. PDF 路径存在两类高风险问题：一类是分块语义被按页快速路径抹平，导致目录/参考文献污染召回；另一类是前端把不可靠的页内 overlay 伪装成精确高亮，误导用户。

目标不是只做止血，而是把这条链路修成“可信、可验证、可扩展”的版本：

- 后端完整透传结构化定位字段
- 前端统一使用一套从强到弱的定位规则
- PDF 无法做到真实精确高亮时，必须诚实 fallback
- PDF page-unit 路径不能破坏已有文档结构语义

## 2. 非目标

这轮不做以下事情：

- 不引入新的 PDF 阅读器壳层、canvas 多页视图或纯文本 PDF 替代视图
- 不重写整个 preview 架构为全新框架级抽象
- 不扩展到与当前 source 预览无关的 UI 重构
- 不修改产品规范中“原生嵌入式 PDF 观感”的要求

## 3. 总体设计

修复拆成四个模块，每个模块职责单一：

1. 后端 source metadata 通道
   - 位置：`backend/server.ts`
   - 负责把检索 chunk 与 metadata 合并，并完整映射为前端 source 对象

2. PDF 清洗与分块一致性
   - 位置：`backend/pipeline/document-cleaner.ts`、`backend/pipeline/document-chunker.ts`
   - 负责保证 page-unit 路径与全文路径有同等级清洗，并保留结构语义

3. 前端统一定位目标规则
   - 位置：`frontend/src/pages/app/components/preview/source-highlight-target.ts`
   - 负责定义“哪些字段会影响定位结果”和“请求去重 key 如何生成”

4. Renderer 行为层
   - 位置：`TextPreview.tsx`、`JsonPreview.tsx`、`PdfPreview.tsx`
   - 负责在各自预览类型里，按统一优先级做定位，并诚实表达能力边界

这个分层的约束很重要：

- 后端负责“给真数据”
- resolver 负责“决定如何定位”
- renderer 负责“把结果展示出来”

任何一层都不应该偷偷补偿另一层的缺口。

## 4. 端到端数据模型

前端 `SourceHighlightTarget` 需要的字段，本轮视为后端必须支持的标准集合。

### 4.1 最低必需字段

- `docId`
- `chunkId`
- `chunkIndex`
- `pageStart`
- `pageEnd`
- `textQuote`
- `content`

### 4.2 结构化定位字段

- `originStart`
- `originEnd`
- `textOffsetStart`
- `textOffsetEnd`
- `sheetId`
- `sheetName`
- `rowStart`
- `rowEnd`
- `columnStart`
- `columnEnd`
- `jsonPath`
- `nodeStartOffset`
- `nodeEndOffset`

### 4.3 后端映射规则

在 `backend/server.ts` 中：

1. `enrichRetrievedChunksWithMetadata(topChunks, metadataRecords)`
   - 负责把 metadata 合并回 chunk
   - 优先保留 chunk 上已有值
   - chunk 缺失时，再回落到 metadata
   - 输出应是“字段完整的 chunk”

2. `mapSources(topChunks)`
   - 只做映射，不再负责猜测结构化字段
   - 将完整 chunk 转成前端 source 对象
   - 不允许 source 类型里声明了字段，但 `mapSources` 从不输出该字段

### 4.4 约束

- 前端不得继续假设“content 截断文本足够定位”
- 结构化字段必须作为正式链路的一部分，而不是调试字段
- 如果 metadataRecords 无某个字段，系统可以 fallback，但不能静默丢字段定义

## 5. 前端统一定位规则

所有 preview renderer 使用一致的定位哲学：从最强、最可信的结构化字段开始，逐级回退到较弱策略。

### 5.1 文本预览 `TextPreview`

优先级：

1. `textOffsetStart/textOffsetEnd`
2. `textQuote`
3. `content`

行为：

- 有 offset 时，按字符区间定位并高亮，这是最可信的结果。
- 没有 offset 时，再尝试 `textQuote`。
- `content` 仅作为最后兜底。
- 同一段文本里如果出现多个相同片段，offset 必须能命中正确位置，不能默认命中第一个。

### 5.2 JSON 预览 `JsonPreview`

优先级：

1. `nodeStartOffset/nodeEndOffset`
2. `jsonPath`
3. `textQuote`
4. `content`

行为：

- 保持原文文本视图，不切换成树形浏览器。
- 有 node offset 时，直接按原始 JSON 文本区间高亮。
- 没有 offset 但有 `jsonPath` 时，将路径解析到目标节点，再映射到文本范围。
- 不再保留 `jsonPath === '$.profile'` 这种特判逻辑。
- 文本匹配仅作 fallback。

### 5.3 PDF 预览 `PdfPreview`

优先级：

1. 结构化页码 + 可验证页内命中
2. 页级 fallback

行为：

- 先使用 `pageStart/pageEnd` 锁定目标页。
- 再在该页内，基于 `textQuote` 或更强结构化信息尝试匹配目标文本。
- 只有当页内高亮矩形和实际显示坐标系可验证一致时，才允许展示 `exact`。
- 如果做不到可靠映射，必须回退到 `page-fallback`，并展示明确提示：已定位到目标页，但正文精确高亮不可用。

约束：

- 当前 iframe 外 overlay 方案不得再被标记为 `exact`，除非坐标系一致性问题被实质解决并有测试证明。
- 不能为了“看起来更高级”而伪装精确高亮成功。

## 6. 请求去重规则

当前问题不是没有去重，而是去重 key 过于粗糙，错误吞掉了同一 chunk 内不同命中位置的请求。

新的 request key 必须覆盖所有会改变定位结果的字段：

- `docId`
- `chunkId`
- `chunkIndex`
- `pageStart`
- `pageEnd`
- `originStart`
- `originEnd`
- `textQuote`
- `textOffsetStart`
- `textOffsetEnd`
- `sheetId`
- `sheetName`
- `rowStart`
- `rowEnd`
- `columnStart`
- `columnEnd`
- `jsonPath`
- `nodeStartOffset`
- `nodeEndOffset`
- `content`

规则：

- 只要这些字段中任意一个变化，并且变化会影响定位结果，就必须生成新的 key。
- 同一个 `docId + chunkId + chunkIndex` 不能再被视为“必然同一个定位请求”。

## 7. PDF 清洗一致性

`backend/pipeline/document-cleaner.ts` 当前对全文文本和 page-unit 文本的清洗等级不一致。本轮统一成：凡是影响召回质量和预览噪音的清洗，必须同时作用于全文文本和 unit 文本。

至少包括：

- 页脚页码移除
- 参考文献尾移除
- 乱码移除
- 非法符号移除
- 空白折叠

规则：

- 不允许 `cleaned.text` 被清洗过，而 `cleaned.units` 仍然保留同一类噪音
- 后续 chunking 无论走全文路径还是按页路径，输出内容质量必须等价

## 8. PDF 分块语义恢复

`backend/pipeline/document-chunker.ts` 中，page units 不能再作为“绕过结构语义的提前返回路径”。

### 8.1 新原则

- page units 是更细粒度输入，不是跳过结构判断的捷径
- 是否有 page units，不应决定是否保留章节语义

### 8.2 目标行为

对于 PDF page-unit 路径：

1. 先判断每页内容更接近哪类结构：
   - `toc`
   - `references`
   - `appendix`
   - `body`

2. 不同结构采用不同策略：
   - `toc`：保留，但 `retrievalEligible: false`
   - `references`：不得混入正文语义召回
   - `appendix`：保留附录身份，不抹平成 body
   - `body`：允许按页或按页内语义继续分块

3. 页级 title / hierarchy 可以利用 page label，但不能覆盖掉原有文档结构分类

### 8.3 明确禁止

- 不能因为存在 `pageUnits` 就直接提前 `return pageChunks`
- 不能把所有页都强制写成 `sectionType: 'body'`
- 不能把目录页、参考文献页默认设成可检索正文

## 9. 测试策略

### 9.1 后端测试

文件：`backend/server.sources.test.ts`

新增或补强：

- `mapSources` 输出完整结构化字段
- `enrichRetrievedChunksWithMetadata` 合并后不丢字段
- chunk 优先、metadata 回退 的覆盖逻辑

### 9.2 PDF 清洗与分块测试

补强 `backend/pipeline` 相关测试，覆盖：

- page-unit 路径不会把页脚页码重新带回 chunk
- page-unit 路径不会把 reference tail 重新带回 chunk
- structured PDF 中，目录页不是正文可检索 chunk
- structured PDF 中，参考文献页不会混进正文召回

### 9.3 前端预览测试

补强 renderer 测试，覆盖：

- `TextPreview` 优先使用 text offsets
- 同一关键词多次出现时，offset 能命中正确位置
- `JsonPreview` 支持通用 `jsonPath` 或 node offsets
- request key 在 `originStart/originEnd/columnStart/columnEnd` 变化时会重新生成
- `PdfPreview` 在无法验证可靠精确映射时，只能进入 `page-fallback`

### 9.4 交互测试

覆盖：

- 高亮块点击行为仍然成立
- “返回 AI 回答”链路不回归
- 同一 chunk 内不同 source 定位请求会重新触发预览

## 10. 实施顺序

推荐顺序如下：

1. `backend/server.ts`，补全结构化字段透传
2. `source-highlight-target.ts`，补全 request key
3. `TextPreview.tsx`，补 offset 优先定位
4. `JsonPreview.tsx`，去掉硬编码特判，改成通用结构化定位
5. `PdfPreview.tsx`，移除不可信 exact 语义，改为可验证 exact 或诚实 fallback
6. `document-cleaner.ts`，统一全文与 units 清洗等级
7. `document-chunker.ts`，恢复 page-unit 路径的结构语义
8. 补完测试并跑相关验证

## 11. 验收标准

这一轮完成后，应满足以下结果：

1. 后端 source 对象包含完整结构化字段，前后端类型不再脱节。
2. 文本和 JSON 预览优先使用结构化定位，而不是默认模糊文本匹配。
3. PDF 预览不再展示不可信的“假精确高亮”。
4. PDF 无法精确定位时，会诚实地跳页并提示 fallback。
5. PDF page-unit 路径不再污染正文召回。
6. 同一 chunk 内不同命中位置会重新触发预览，而不是被错误去重吞掉。

## 12. 风险与取舍

### 12.1 主要风险

- 通用 `jsonPath` 到文本范围的映射实现可能比当前特判复杂
- PDF 真正做到坐标系一致的 exact 高亮，可能超出本轮可验证边界
- page-unit 语义恢复如果实现过于激进，可能影响现有 chunk 数量和召回分布

### 12.2 本轮取舍

- 对 PDF，高可信 fallback 优先于不可靠 exact
- 对 JSON/Text，先把结构化定位链路补真，再考虑更复杂的性能优化
- 对分块逻辑，优先恢复语义正确性，再考虑更激进的 page-level 优化

## 13. 成功定义

成功不是“高亮更多地方”，而是：

- 高亮行为可信
- 数据链路真实完整
- fallback 行为明确诚实
- 召回结果不因 page-unit 快速路径而变脏

这才是这一轮 source preview reliability 修复的完成标准。
