# 分块策略完整说明（当前实现）

本文档基于当前代码实现整理，覆盖从解析到入库的完整分块链路，并详细说明多层策略如何协同切分。

## 1. 流水线位置与执行顺序

文档处理阶段顺序：

1. `parsing`
2. `cleaning`
3. `chunking`
4. `quality_check`
5. `embedding`
6. `storing`

在实际代码中，分块发生在 `chunking` 阶段，调用链为：

- `chunkDocument(cleaned)`：按文件类型执行主分块
- `qualityCheckChunks(...)`：做统一质量修正

对应位置：`backend/server.ts`。

## 2. 分块前输入：parse + clean

### 2.1 解析层（`document-parser.ts`）

统一输出 `ParsedDocument`：

- `text`：全文文本
- `units[]`：结构化单元
  - `body`
  - `sheet`
  - `json_node`
  - `heading`

不同类型输入先被转成这个统一结构。

### 2.2 清洗层（`document-cleaner.ts`）

清洗后得到 `CleanedDocument`，核心动作：

- 去分页脚注（如 `页码 1`）
- 去乱码/异常符号
- 压缩空行
- 去参考文献尾部（命中 `参考文献/references` 时截断）
- 文本归一化

并保留：

- `cleaningApplied[]`
- `units[]`
- `structure[]`（标题结构）

## 3. 分块总览：四层策略

当前实现不是“仅按标点切分”，而是四层组合：

1. 句边界层（标点/换行切句）
2. 窗口组装层（按 token 窗口拼块 + overlap）
3. 类型特化层（pdf/docx/txt/sheet/json 各自策略）
4. 质量修正层（小块合并、超大块拆分、空块过滤）

最终 chunk 由四层共同决定。

## 4. 第一层：句边界层（标点切分）

核心正则：

- `SENTENCE_REGEX = /[^。！？；.!?;\n]+[。！？；.!?;]?/g`

含义：

- 识别中文/英文句末标点：`。！？；.!?;`
- `\n` 作为边界
- 每段可带一个句末标点

切分前会做文本归一化（去 `\r`、压缩空白、`trim`）。

说明：这层就是“按标点切句”，但它只是基础层，不等于最终分块结果。

## 5. 第二层：窗口组装层（token 预算切块）

核心函数：`chunkSectionBySentences(...)`。

### 5.1 token 估算

当前不是 tokenizer 精确计数，使用近似估算：

- `estimateTokens(text) = ceil(text.length / 2)`

### 5.2 组装规则

参数：

- `minToken`
- `maxToken`
- `overlapToken`

流程：

1. 逐句累积到当前缓冲
2. 若“加入下一句后超过 `maxToken` 且当前已达到 `minToken`”，则落一个 chunk
3. 从上一块尾部回溯一段内容作为 overlap（目标 `overlapToken`）
4. 新块以“overlap + 当前句”继续
5. 末尾再落最后一块

补充：

- 每块记录 `overlapTokenCount`
- 首块可带标题前缀，后续块不重复

## 6. 第三层：按文件类型特化策略

入口：`chunkDocument(cleaned)`。

### 6.1 PDF / DOCX

函数：`chunkPdfDocx(cleaned)`。

规则：

- 小文档（`<= 900` token）：单块
- 大文档：先分章节，再按句边界 + token 窗口切块

章节来源：`toSections(cleaned)`，通过标题检测函数识别层级（1/2/3）与类型。

章节类型处理：

- `abstract/preface/ack`：整节单块
- `toc`：整节单块，且 `retrievalEligible = false`
- `appendix/references`：语义切块，`min=600, max=800, overlap=40`
- `body`：语义切块，`min=600, max=800`
  - 一级节 `overlap=40`
  - 二/三级节 `overlap=100`

### 6.2 TXT

函数：`chunkTxt(cleaned)`。

- `<= 900` token：单块
- 否则：`min=500, max=900, overlap=80`

### 6.3 XLSX / XLS / CSV

函数：`chunkSheets(cleaned)`。

策略：

- 按 sheet 处理（CSV 视作单 sheet）
- 块内容带 `Sheet:` 与 `Header:` 前缀
- 小表（`<= 900` token）单块
- 大表按“行”滚动分组
  - 超过 900 切块
  - 行级 overlap，目标约 40 token

### 6.4 JSON

函数：`chunkJson(cleaned)`。

策略：

- `<= 900` token：单块
- 否则按顶层 `json_node` 分组
- 分组累计接近阈值（`> 1200` 时 flush）
- `overlapTokenCount = 0`

## 7. 第四层：统一质量修正（后处理）

入口：`qualityCheckChunks(chunks)`，顺序固定：

1. `mergeSmallChunks`
2. `splitOversizedChunks`
3. `filterInvalidChunks`

### 7.1 小块合并

- 条件：`tokenCount < 100`
- 动作：并入前一块
- 标记：`qualityStatus = merged`，`qualityNote = merge_small_fragments`

### 7.2 超大块兜底拆分

- 条件：`tokenCount > 1200`
- 拆分方式：
  - `sheet`：按行拆
  - 其他：按句拆
- 子块目标上限约 1000 token
- 标记：`qualityStatus = split`，`qualityNote = split_oversized_chunk`

### 7.3 空块过滤

- `trim` 后为空的 chunk 直接过滤

## 8. Chunk 元数据与可追踪性

每个 chunk 草稿包含典型字段：

- `sourceUnit`
- `sourceLabel`
- `content`
- `tokenCount`
- `overlapTokenCount`
- `qualityStatus`
- `qualityNote`
- `retrievalEligible`
- `sectionLevel`
- `sectionType`

后续会映射并落库到 `document_chunk_metadata`（SQLite），用于追踪质量与来源信息。

## 9. 与检索的关系

当前策略中已经产生了 `retrievalEligible`（例如目录块可设为 `false`），但现有检索路径主要是向量表直接向量搜索 Top-K；是否使用该字段做检索过滤，取决于后续检索实现是否显式接入。

## 10. 一句话总结

你当前的完整分块策略是：

**“句边界切分（标点） + token 窗口拼块（含 overlap） + 文件类型特化 + 质量兜底修正”**。

其中“按标点（`。.!?;`）切句”是基础层，但最终 chunk 由四层共同决定。
