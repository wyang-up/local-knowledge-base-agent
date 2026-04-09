# English PDF Pipeline Hardening Verification

> Status: Historical verification snapshot. Useful as evidence for that hardening phase, but not a complete statement of current project health.

## Commands

```bash
npm test -- backend/document-chunker.test.ts backend/document-embedding.test.ts backend/document-storage-writer.test.ts backend/document-pipeline-runner.test.ts
npm run lint
```

## Results

- Targeted backend tests: passed (`4` files, `30` tests, `0` failed)
- Lint: passed (`tsc --noEmit` for frontend and backend)

## Real File Verification

### English PDF

- Source file: `data/uploads/1775203682652-28993-Article Text-33047-1-2-20240324.pdf`
- Old failed document: `f0783796-e842-48e8-8123-9f5dceed1bd1`
- Old retry behavior after runtime fix:
  - retry stage: `embedding`
  - final error code: `EMBEDDING_FAILED`
  - old artifact still had a single giant chunk (`tokenCount = 21152`), so retrying old artifacts still hit `413`
- Reuploaded document: `33828420-4954-4541-aabe-90666a7b4bee`
- Reupload result:
  - final status: `completed`
  - chunk count: `81`
  - processed units / total units at storing: `81 / 81`
  - sample chunk prefix: `EG-NAS: Neural Architecture Search with Fast Evolutionary Exploration ...`
- Verification intent:
  - prove English PDF no longer collapses into one giant chunk
  - prove full reparse + rechunk + re-embed path succeeds

### Mixed-Language PDF

- Source file: `/tmp/mixed-language-sample.pdf`
- Uploaded document: `105bad6f-976f-4d0c-bc32-04008751a771`
- Result:
  - final status: `completed`
  - final stage: `completed`
  - chunk count: `6`
  - processed units / total units at storing: `6 / 6`
  - sample chunk prefix: `Mixed Language Resume.`
- Verification intent:
  - prove mixed-language PDF path reaches `completed`
  - prove the PDF path no longer depends on Chinese-only sentence boundaries

### Bilingual DOCX

- Source file: `/tmp/bilingual-sample.docx`
- Uploaded document: `0babb323-28dd-4064-b62e-225458dfde2a`
- Result:
  - final status: `completed`
  - final stage: `completed`
  - chunk count: `5`
  - processed units / total units at storing: `5 / 5`
  - sample chunk prefix: `Bilingual Overview.`
- Verification intent:
  - prove DOCX path uses the same bilingual chunking behavior
  - prove bilingual DOCX can finish end-to-end under the new pipeline

## Notes

- Stage-specific failure reporting is now honest for embedding failures; old runs that completed before restart still retain historical `PARSING_FAILED` logs.
- The key regression proved so far is: the same English PDF that previously failed with `413` during embedding now completes after full reupload under the new chunking logic.
- Mixed-language PDF and bilingual DOCX smoke tests both reached `completed`, so the bilingual boundary handling is no longer limited to the English PDF case.
