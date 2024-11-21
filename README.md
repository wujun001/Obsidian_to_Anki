# Obsidian to Anki - README

[中文](#变更) | [English](#changelog)

---

## English

### Based on
This project is based on [Obsidian_to_Anki](https://github.com/ObsidianToAnki).

### Changelog

#### [Unreleased]

##### New
- Added progress display, log output, and time statistics in the status bar.

##### Changed
- Ignored mathematical formulas inside code blocks (content wrapped in `$`), formulas are no longer converted.
- Ignored syntax-formatted notes and fields inside code blocks (e.g., notes divided by default `START` and `END`, and fields separated by `:`).
- Adjusted handling rules for escape characters outside code blocks: correctly parses `\$` as the literal character `$`.
- Improved the handling of escaped opening backticks (e.g., ``` \` ```), so they are no longer recognized as starting a code block, making the matching logic more accurate. Additionally, refined the matching rules for mathematical formulas to ensure `$` or `$$` preceded by a backslash escape (e.g., `\$` or `\$\$`) are not identified as valid formulas.

---

## 变更

### 基于
本项目基于 [Obsidian_to_Anki](https://github.com/ObsidianToAnki) 修改。

### Changelog

#### [未发布]

##### 新增
- 增加状态栏显示进度、日志输出和耗时统计。

##### 改变
- 忽略代码块中的数学公式内容（由 `$` 包裹的部分），不再进行公式转换。
- 忽略代码块内的语法格式的笔记和字段（如默认的 `START`、`END` 分割的笔记，以及 `:` 分割的字段）。
- 对代码块外转义字符的处理规则：将 `\$` 正确解析为普通字符 `$`。
- 起始被转义的反引号（如 ``` \` ```）不再识别为代码块，匹配逻辑更符合预期。同时，改进数学公式的匹配规则，确保 `$` 或 `$$` 前如果有反斜杠转义（如 `\$` 或 `\$\$`），则不会被识别为有效公式。
