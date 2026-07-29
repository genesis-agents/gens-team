---
name: 不要用 Python 脚本直写 ts 文件
description: Python open(path, 'w') 误截了 llm-executor.ts 文件后半部分；只能 git restore 救回
type: feedback
originSessionId: 0466edf1-314f-494e-bc8e-163445d754ad
---

2026-05-06 用 Python 脚本覆写 backend ts 文件时，line-by-line 改造逻辑写
错让文件被截到原长度的 65%（341/520 行）。git checkout HEAD 才救回。

**Why:** Edit 工具有原子性 + 整体读再写不会丢内容；Python `open(path, 'w')`

- rewrite 中间任何逻辑 bug 都会让残缺文件 commit。Python 没有 Edit 工具
  那种"old_string 必须匹配"的安全网。

**How to apply:**

- 改 ts 文件**永远用 Edit / Write 工具**，不要用 Bash + Python / sed / awk
- Python 只用于：分析（fs.read + 不写）、生成新文件（first-time write）、
  跑 PrismaClient 查 DB
- 如果 Python 脚本必须改文件，先 `git diff` 自查 wc -l 行数对比，发现误截
  立刻 `git checkout HEAD -- file` 恢复
- 看到 .ts 文件 mojibake / 异常字符（如 broken UTF-8），不要 Python 字节
  替换；用 Edit 加更宽 context，匹配不到就缩小 old_string
