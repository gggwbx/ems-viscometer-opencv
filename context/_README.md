# Context Directory

Place experiment-related documents (Markdown / PDF / DOCX) in this directory. They are automatically loaded when the backend starts.

## Supported Formats

- `.md` — Markdown, recommended
- `.txt` — Plain text
- `.pdf` — PDF (text only)
- `.docx` — Word document

## Example

```markdown
# Experiment Principles

## Core Formula

$$F = m a$$

## Experiment Steps

1. Step one
2. Step two
```

## Notes

- Use `$...$` or `$$...$$` LaTeX syntax for formulas
- Scanned/image-based PDFs cannot extract text
- Files should use UTF-8 encoding
- After adding files, restart backend or call `POST /api/experiment/context/reload`
