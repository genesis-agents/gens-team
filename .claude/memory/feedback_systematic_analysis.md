---
name: systematic-analysis-first
description: User demands systematic root-cause analysis before any fix, not piecemeal patching. Stop guessing, stop blaming LLM output.
type: feedback
---

Stop piecemeal patching. When issues are reported, do a FULL systematic analysis first:

**Why:** User repeatedly got frustrated because fixes were incomplete — problems reappeared after being "fixed". The pipeline's job is to be defensive against all LLM output variations. Never blame LLM output as a root cause — the pipeline must handle it.

**How to apply:**

1. Read ALL relevant code in the chain (prompt → LLM output parsing → pipeline → frontend rendering → export) before proposing any fix
2. Don't fix symptoms one by one — find the root cause pattern
3. Don't say "this is an LLM output issue" — if the pipeline doesn't fix it, the pipeline is the bug
4. Test with actual exported data, not assumptions
5. When user says "之前改了又出现了", it means the previous fix was incomplete — re-examine the entire flow
