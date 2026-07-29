---
name: feedback-error-message-ux-and-encoding-2026-06-12
description: 用户指令：全站错误提示必须清晰友好（canonical lib/utils/api-error）；Windows 批量改中文文件禁用 PowerShell 读写（乱码事故）
metadata:
  node_type: memory
  type: feedback
  originSessionId: 3aadb414-dad0-42c4-a344-20bb00ee77c8
---

**1. 错误提示人性化是硬要求（2026-06-12 用户指令"全项目排查，彻底修改错误提示"）**

**Why**：foresight 导入把 402 quota 的原始 JSON 整段糊给用户（实证截图），用户明确要求全站清晰/明确/友好。

**How to apply**：前端任何 `!res.ok` 路径必须用 canonical `frontend/lib/utils/api-error.ts`（`throw await apiError(res, '上下文')` 或纯函数 `humanizeApiError(status, body)`）。规则：后端中文 message 直接透传（别二次包装吞掉）→ 英文技术签名映射友好语（provider 全 Key 失败/配额/限流/超时/网络/鉴权）→ 状态码兜底 + ≤120 字截短细节。新写 service 的 request 帮手必须接入；后端自己抛的 BadRequest 尽量直接写中文给用户的话。已清洗 6 服务 19 处（3eeb89652）。

**2. Windows 上批量修改含中文的文件禁用 PowerShell Get-Content/Set-Content round-trip**

**Why**：PS 5.1 默认编码把 UTF-8 中文读成 ANSI 再写回 → 全文件乱码（playground api.ts 实翻车，单文件 git checkout 回退后用 Node 重做）。

**How to apply**：批量正则替换一律 `node -e "fs.readFileSync(p,'utf8') ... writeFileSync(p,s,'utf8')"`，或逐处用 Edit 工具。改完必查 `git diff | Select-String "â|ã"` 验无 mojibake。

相关：[[project-foresight-p0-2026-06-12]]
