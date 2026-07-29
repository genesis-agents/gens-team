---
name: feedback_railway_cli_needs_tty
description: railway CLI logs/run 非交互式 shell 下立刻 exit，不流式；agent 端无法可靠 tail prod log，依赖用户主动粘贴
metadata:
  node_type: memory
  type: feedback
  originSessionId: ab227f09-46d4-4a66-ba10-a59d3ce4bdac
---

`railway logs --service backend` 在 Claude Code 子进程（无 TTY）会立刻 exit 0 不输出任何行，background task 的 output 文件保持 0 字节。

**Why:**

- 2026-05-15 实测：background bash 启 `railway logs`，8s 后 output 仍空；进程 alive 但没 stdout
- Railway CLI 检测到 `stdin not a TTY` 默认走 batch fetch，找不到 "tail" cursor 直接退出
- `--json` flag 也救不了，无 TTY 还是不流式

**How to apply:**

- 用户说"监控 Railway CLI"时，不要装作能 tail，要明确说"非交互式不流式，请把日志粘进来"
- prod 诊断标准流程：让用户从 dashboard 复制相关时段的 log 段，agent 这边专心分析根因
- 如果非要 batch fetch，可以试 `railway logs --service backend --tail 200`（一次性拉最近 N 行），但这个 flag 行为也偶尔变；不要默认假设它存在

**Related:** [[feedback_e2e_must_visit_ui]] [[feedback_screenshot_first_then_diagnose]]
