---
name: git mv + pathspec commit drops the delete side
description: When committing a git mv with pathspec, only the destination path captures the rename; the source-side deletion remains uncommitted and HEAD ends up with both files
type: feedback
originSessionId: 229b0e1c-bec7-47da-a470-14d8b4d071db
---

`git mv old.tsx new.tsx` stages two index changes: delete old.tsx + add new.tsx. When you then commit with `git commit -- new.tsx`, the pathspec only matches the destination, so HEAD gets the new file but the delete of old.tsx stays unstaged — leaving HEAD with BOTH files until you do a follow-up cleanup commit. This bit during W3 admin/\_shared move (knowledge/shared.tsx → \_shared/admin-tables.tsx) — required a separate commit 0f5f4fdb9 to finalize.

**Why:** `git commit -- pathspec` matches against the index entries' paths; the deletion entry is keyed by the old path which isn't in the pathspec list. Git doesn't auto-detect the rename and pull both sides in.

**How to apply:** When committing a `git mv` with pathspec, **always include BOTH old and new paths** in the pathspec list, e.g. `git commit -- old.tsx new.tsx` (or use `-A` if scope-safe). Verify post-commit with `git ls-tree HEAD <old-path>` — if it still resolves, the delete didn't land. Required because of `feedback_multi_session_must_use_pathspec_commit` (pathspec is mandatory in multi-session, but you must list both rename sides).
