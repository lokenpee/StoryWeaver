# StoryWeaver 项目 - 代码修改经验记录

## 编码陷阱（重要！）

1. **文件编码**：`txtToWorldbook/core/constants.js` 等文件使用 **UTF-8 with BOM** 编码。BOM 头（`\xef\xbb\xbf`）会导致 `StrReplaceFile` 直接匹配失败。

2. **PowerShell 中文传参死亡陷阱**：
   - 绝对不要通过 `python -c "..."` 在 PowerShell 中传递包含中文的三引号字符串，会出现不可恢复的 `SyntaxError: unterminated triple-quoted string literal`。
   - PowerShell 把中文传给 Python 的 `-c` 参数时会发生编码损坏（mojibake），导致 Python 解析失败。
   - **正确做法**：先把 Python 脚本内容写到临时 `.py` 文件（用 `WriteFile`），再执行 `python temp.py`。

3. **终端显示问题**：PowerShell 中 Python 打印中文有时显示为乱码（���），但文件内容本身是正确的，不要根据终端显示来判断文件是否已损坏。
## SillyTavern 技术资料

项目内 SillyTavern 技术参考文档：

- `docs/sillytavern-technical-reference.md`

遇到以下任务时，必须先完整阅读该文档的相关章节，再分析或修改代码：

- 修改 SillyTavern 扩展入口、生命周期或事件钩子
- 调用 SillyTavern API、生成接口或上下文对象
- 操作世界书、角色卡、聊天消息或扩展设置
- 不确定某个 SillyTavern 接口、字段或兼容行为
- 排查仅在特定 SillyTavern 版本中出现的问题

不要仅凭记忆猜测 SillyTavern 行为。如果文档、当前代码和实际运行行为冲突，应明确指出冲突并进一步验证。

## 推荐修改流程

对含中文的长文本块进行修改时：
1. 优先用 Python 脚本文件操作（写临时 `.py` → 执行 → 删除）。
2. 如果必须用 `StrReplaceFile`，先确认文件是否有 BOM 头；若有，考虑用 Python 处理。
3. 修改后立刻用 `ReadFile` 验证结果，不要靠 `Shell` 输出判断。

## 人名替换记录

- 提示词 AI 人设名：`Amily` / `Amiyl` → `秋青子`
- 已全部替换完毕。
