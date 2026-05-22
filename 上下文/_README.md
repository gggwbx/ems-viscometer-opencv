# 上下文目录

将实验相关文档（Markdown / PDF / DOCX）放入此目录，后端启动时自动加载。

## 支持格式

- `.md` — Markdown，推荐
- `.txt` — 纯文本
- `.pdf` — PDF（仅文字版）
- `.docx` — Word 文档

## 示例

```markdown
# 实验原理

## 核心公式

$$F = m a$$

## 实验步骤

1. 步骤一
2. 步骤二
```

## 注意事项

- 公式使用 `$...$` 或 `$$...$$` LaTeX 语法
- 扫描件/图片型 PDF 无法提取文字
- 文件编码建议 UTF-8
- 添加文件后重启后端或 `POST /api/experiment/context/reload`
