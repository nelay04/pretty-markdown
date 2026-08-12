---
agent: 'agent'
description: 'Generate an 80-character git commit title for the local diff'
---

# Generate Commit Title

## Purpose
Provide a single-line, ready-to-paste git commit title (<= 80 characters) that reflects the most important local changes since `HEAD`.

## Input to collect
- Run exactly one command to view the local diff:
  ```@terminal
  git diff HEAD
  ```

## Secondary input to collect
- Check for anything not yet staged that hints at the intent of the change:
  ```@terminal
  git status --porcelain
  ```
- If `CHANGELOG.md` is part of the diff, its newest entry usually states the change in user-facing terms already; prefer that wording over paraphrasing the code.

## How to decide the title
1. From the diff, find the dominant area and the change type (bug fix, feature, docs update, build or config tweak). Areas in this repository:
   - `src/services/` — the working parts: `pdfExporter` (Chrome export and browser resolution), `webviewPdfExporter` (browserless fallback), `previewManager`, `markdownRenderer`, `themeManager`, `settingsManager`, `actionScanner`, `actionRunner`
   - `src/utils/` — shared helpers: `htmlGenerator` (the document stylesheet), `mermaid`, `helpers`
   - `src/extension.ts` — desktop entry point; `src/extension.web.ts` — the separate web build for vscode.dev
   - `src/providers/` — tree view and other VS Code providers
   - `package.json` — commands, menus, keybindings and settings under `contributes`
   - `esbuild.js`, `tsconfig.json`, `.vscodeignore` — build and packaging
   - `docs/`, `README.md`, `CHANGELOG.md` — documentation
2. Describe the change in terms of what a user of the extension gets, not the mechanics, when the two differ. "stop the export notification from sticking" beats "add a timeout to browser.close()".
3. Draft an imperative, plain-ASCII title that:
   - Names the affected feature when it is not obvious from the type (preview, PDF export, mermaid, theming, actions, tree view)
   - Stays within 80 characters and has no trailing punctuation

## Final output
- Reply with only the commit title on a single line—no extra text.

## Commit title convention

This repository uses Conventional Commits **without a scope**:

`<type>: <summary>`

**Allowed types**
- feat, fix, docs, refactor, perf, test, build, ci, chore

**Scope rules**
- Omit the scope. Every commit in this repository's history is written as `type: summary`, and a scope should only be introduced if the project decides to adopt them everywhere.

**Summary rules**
- Imperative, present tense ("add", "update", "remove", "fix")
- Keep it <= 72 characters when possible; be specific, avoid "misc changes"
- Say which surface is affected when a change touches only one of them: the preview, the PDF export, or the web build. Several features exist in more than one place, and "in the preview" or "in exported PDFs" is what makes the title useful.
- A version bump belongs in its own release commit (`chore(release): vX.Y.Z`), not folded into a feature title.

**Examples** (real commits and changes from this repository)
- `feat: add mermaid diagram support to markdown preview and PDF export`
- `fix: stop mermaid error graphic from appearing in exported PDFs`
- `refactor: PDF export service to improve Chrome handling and add webview fallback`
- `feat: themeable colours for every component, in preview and export`
- `fix: reuse an installed Chrome instead of downloading it on every export`
- `chore: add local development documentation`
- `docs: document themes and per-component colours`
