# Architecture

How **Pretty Markdown** is put together: the modules, the three render targets, and the boundaries that matter when you change something. Build and debug instructions live in [local-development.md](local-development.md).

---

## 1. Two entry points, one extension

| Entry | Platform | Bundle | Host |
|---|---|---|---|
| [`src/extension.ts`](../../src/extension.ts) | node | `dist/extension.js` | desktop VS Code (`main`) |
| [`src/extension.web.ts`](../../src/extension.web.ts) | browser | `dist/extension.web.js` | vscode.dev / github.dev (`browser`) |

Both are bundled by `esbuild.js` in a single pass, with `vscode` marked external.

`extension.ts` is registration only: it creates the tree view, the status bar items, and every command, then delegates the work to a service. Keep it that way — logic added there is unreachable from the web build and untestable in isolation.

`extension.web.ts` is standalone by necessity. It shares [`themeManager`](../../src/services/themeManager.ts), [`utils/mermaid`](../../src/utils/mermaid.ts) and [`utils/printLayout`](../../src/utils/printLayout.ts), but carries **its own copy** of the markdown-it setup and the HTML template, because it cannot pull in anything that touches `node:fs`, `path`, or puppeteer. This duplication is deliberate and it is the project's sharpest edge: **a change to preview markup or styling is only half done until it is mirrored in `extension.web.ts`.**

---

## 2. Module map

```
src/
  extension.ts            desktop activation: commands, tree view, status bar
  extension.web.ts        browser activation: preview + print-based export, self-contained
  providers/
    treeViewProvider.ts   TreeDataProvider — files, filter, per-file action groups
  services/
    markdownRenderer.ts   markdown-it + highlight.js -> HTML; mermaid fences; resolveImage hook
    previewManager.ts     the preview webview: panel lifecycle, CSP, link routing
    pdfExporter.ts        Chrome/puppeteer-core export — browser discovery, print layout
    webviewPdfExporter.ts browserless fallback export via html2pdf.js in a webview
    themeManager.ts       theme presets + prettyMarkdown.colors overrides -> ThemeTokens
    settingsManager.ts    the settings webview (palette pickers, confirmation toggle)
    actionScanner.ts      finds runnable commands in a Markdown file
    actionRunner.ts       runs them in a terminal; pause/stop/restart state
  utils/
    htmlGenerator.ts      the full HTML document: <head>, CSS, theme variables, slots
    mermaid.ts            boot + cleanup scripts injected into every webview/page
    printLayout.ts        page-fit script: scales or splits oversized blocks
    helpers.ts            label and escaping helpers
  types/index.ts          TreeItem subclasses and the node union
```

Dependency direction is one way: `extension → providers/services → utils → types`. Services never import `extension.ts`, and `utils/` never imports a service other than `themeManager`.

---

## 3. The render pipeline

One pipeline feeds all three targets, and each target differs only at the edges:

```
Markdown text
   -> markdownRenderer.renderMarkdown(text, { resolveImage })
   -> htmlGenerator.getWebviewContent(html, title, { head, scripts, theme })
   -> target
```

| Target | Images resolve to | Mermaid loaded from | Finished when |
|---|---|---|---|
| Preview webview | `webview.asWebviewUri` | `asWebviewUri` | never — it renders live |
| Chrome export | `data:` URIs | `page.addScriptTag` | `waitForFunction` on the ready flag |
| Browserless export | `data:` URIs | `asWebviewUri` | ready flag polled before rasterising |

`renderMarkdown` takes a `resolveImage` hook rather than choosing a scheme itself, because Chrome refuses `file://` subresources in a page built with `setContent`, and the fallback webview may only read from the extension's own folder.

**Colours** flow one way: settings -> `resolveTheme()` -> `ThemeTokens` -> CSS custom properties in `htmlGenerator`, plus mermaid theme variables. Never hardcode a colour in a template; add a token to `ThemeTokens`, give every preset a value, expose it in `package.json` under `prettyMarkdown.colors`, and read it as `var(--pm-*)`.

**Everything that runs in a webview is generated as a string** and injected under a nonce-based CSP. Any new inline script needs the same nonce and a matching CSP directive, or it silently does not run.

---

## 4. PDF export

Two engines, chosen at runtime. [`pdfExporter.ts`](../../src/services/pdfExporter.ts) drives Chrome through `puppeteer-core` (which ships no browser) and produces a real vector PDF with selectable text. It tries, in order: `PUPPETEER_EXECUTABLE_PATH`, the shared `~/.cache/puppeteer`, the legacy per-profile cache, a system Chrome, and only then an opt-in download — and a candidate that exists but fails to launch is skipped, not fatal.

When no Chrome can run, [`webviewPdfExporter.ts`](../../src/services/webviewPdfExporter.ts) converts the page with html2pdf.js inside a webview. The result is rasterised: no selectable text, roughly 3× the size. It is a fallback, never a default, and the user is always told why they got it.

`puppeteer-core` is pinned to **21.11.0** on purpose; see the reasoning in [local-development.md](local-development.md#9-dependency-hygiene) before touching it.

---

## 5. Page fit

[`printLayout.ts`](../../src/utils/printLayout.ts) generates a script that runs in the page before printing. It measures blocks that cannot break — diagrams, images, code — against the printable area, scales them down to a floor of 0.5, keeps a heading with the block that follows it, and reports the gaps it could not close. `prettyMarkdown.oversizedDiagrams` decides what happens to those: `keepWhole`, `split`, or `ask` the user once.

Both the Chrome path and the web build use the same script with the same page setup (A4, 5 mm side / 10 mm block margins). Changing the margins means changing them in `pdfExporter.ts` and `extension.web.ts` together.

---

## 6. Actions

[`actionScanner.ts`](../../src/services/actionScanner.ts) reads a Markdown file and returns runnable commands from three sources: fenced code blocks in a shell language or tagged as an action, `<!-- action: ... -->` comments, and entries under an `Actions` section. When a file offers more than one source type, the tree view asks which to use and caches the answer per file.

[`actionRunner.ts`](../../src/services/actionRunner.ts) owns a single terminal and a single piece of run state, published through `onDidChangeActionState`. The status bar items and the tree view subscribe to it — they never read the runner's internals.

Actions execute shell commands from the open document, so the confirmation prompt is a safety boundary, not a nicety. Nothing may run a scanned command without either the prompt or an explicit, user-set opt-out.

---

## 7. Where to add things

| Change | Touch |
|---|---|
| New command | `package.json` (`commands`, `activationEvents`, `menus`) + registration in `extension.ts` + a service for the logic |
| New setting | `package.json` (`configuration`) + the service that reads it + the CHANGELOG |
| New colour | `ThemeTokens` + all four presets + `package.json` + `htmlGenerator` CSS + `extension.web.ts` |
| Preview styling | `htmlGenerator.ts` **and** `extension.web.ts` |
| Markdown feature | `markdownRenderer.ts` **and** `extension.web.ts`'s local renderer |
| Export behaviour | `pdfExporter.ts` and, if it is layout, `printLayout.ts`; check the fallback still works |

---

## Related

- [local-development.md](local-development.md) — build, debug, package, dependency hygiene
- [release-workflow.md](../devdocs/release/release-workflow.md) — the four release steps
