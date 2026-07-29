---
name: lint-staged-hung-process-kill-stash-cleanup-recipe
description: lint-staged on Windows 经常 hang（jest worker 不退） → 大文件 commit 卡 10+ 分钟；累积 stash 上几十个；标准处理流程
metadata:
  node_type: memory
  type: feedback
  originSessionId: b2a1b3e2-dcf6-4709-b034-22dd0f9570ab
---

Windows + 大型 backend 项目 + lint-staged 内置 jest --runInBand --bail 的组合**经常 hang**。表现：

- `git commit` 后 lint-staged 进入 jest 阶段，10+ 分钟不退
- jest 自己 log "A worker process has failed to exit gracefully and has been force exited"
- 多次 commit 累积 lint-staged 残留 backup stash 几十个
- 后续 commit 撞 stash lock 链式 hang

**Why**：jest worker on Windows 在某些 spec（含 NestJS DI / facade barrel / large transform）会"形式上完成但进程不退出"，lint-staged 同步等 child 死锁。

**How to apply（标准恢复流程）**：

1. **commit 后立即检查**（每次必做）：

   ```bash
   ps -ef | grep -i "lint-staged\|jest" | grep -v grep
   git stash list | head -3   # 看是否新增了 lint-staged automatic backup
   ```

   如果有 hung process 或新增 stash → 立刻处理别让累积。

2. **诊断 hung lint-staged 进程**：

   ```bash
   # cygwin ps 给的 PID 是 cygwin 内部 PID，taskkill 不识别
   # 用 wmic 拿真 Windows native PID:
   wmic process where "name='node.exe' or name='bash.exe'" get processid,parentprocessid,commandline | grep -i lint-staged
   # 然后 taskkill /F /PID <native-pid> /T 杀整个进程树
   ```

3. **kill 后 commit 通常仍 fail（exit 1）**：
   - working tree / staging 通常**完好**（lint-staged stash backup 已 + 但 pop 没完成）
   - `git status --short` 验证文件还都在 staged
   - `diff <(git stash show stash@{0} -p) <(git diff --cached)` 应 empty → backup 与 staging 等价

4. **重新 commit 跳过 hook**：

   ```bash
   git commit --no-verify -- <pathspec>  # 用户授权时
   ```

   先确保所有 hook 检查（type-check / prettier / 相关 jest）已手动跑过 + 通过。

5. **清理冗余 stash**（**必须** reverse-apply 验证安全）：

   ```bash
   for i in 0 1 2 ...; do
     echo "=== stash@{$i} ==="
     git stash show -p stash@{$i} | git apply --check -R 2>&1 | head -3
     # 干净退出 = 内容已在 HEAD = safe drop
     # 报错 = 检查是不是因为后续 commit 删/改了相关文件（仍可 safe drop）
   done
   # 从高 index 往低 drop 避免 shift
   for i in 6 5 4 3 2 1 0; do git stash drop stash@{$i}; done
   ```

   **手动命名 stash（"On main: xxx"）一律不动** —— 这些是别 session 故意保留的 WIP。

6. **彻底预防**：
   - 写完代码立即 `prettier --write <files>` —— 让 lint-staged 找不到东西可改，绕过 stash 逻辑（[[feedback_prettier_after_write]]）
   - 大型 commit (>1000 lines / 多模块) **拆成多次小 commit** —— 每次 lint-staged 只触发少量 spec
   - 或者用 `--no-verify`（用户授权时）+ 手动跑 verify:quick

**配套现状（2026-05-15 fix 后）**：

- 7 个累积的 lint-staged automatic backup stash 已清
- facade barrel circular bug 已修（[[feedback_facade_barrel_module_cycle]]）—— image-generation / admin spec 不再撞
- jest --changedSince 模式只要 cwd 在 backend/ 就正常工作

**变体：OOM 崩溃（非 hang）+ 多 session 并发（2026-05-21）**：

- 表现不是 hang 而是 **pre-commit 直接 V8 崩溃**（堆栈 `v8::String::Utf8Value` / `uv_timer_set_repeat` / `SystemClockTimeMillis`，husky exit 1），lint-staged 的 eslint typed-linting 在系统内存压力下 OOM。
- **此时严禁 mass-kill node**：实测 27 个 node.exe 全是**活的并发 session**（`Get-CimInstance Win32_Process` 查 ParentProcessId，dead-parent 孤儿 = 0）。`taskkill /im node.exe` 会杀掉**自己这个 Claude 会话 + 别 session 的未提交工作**。dead-parent 孤儿检测能精确区分，但本例 0 孤儿 = 没有可杀的。
- **正解（gate 仍跑、不绕过、不杀进程）**：给 hook 的 node 提堆 →
  ```bash
  NODE_OPTIONS='--max-old-space-size=6144' git commit -F - <<'MSG' ... MSG
  NODE_OPTIONS='--max-old-space-size=6144' git push origin main
  ```
  child eslint/jest 继承 NODE_OPTIONS → 不再 OOM → lint-staged 干净跑完（"Applying modifications / Cleaning up" + 自动 pop backup stash）。**优先于 --no-verify**（这是让 gate 正常跑，不是跳过）。

**关键警示**：

- `npx jest --clearCache` 不修 `--changedSince` 报 "Cannot use import statement outside a module" —— 那是 cwd 错误（没 cd 到 backend/）+ 没找到 jest.config.js → fallback 默认配置无 ts-jest transform。**先验证 cwd**
- pre-push hook hung 通常是 jest worker 不退；**最后兜底用 `--no-verify` 也是合规的**（用户授权 + 已手动跑全部检查）
