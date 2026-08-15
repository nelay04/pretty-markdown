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

`extension.web.ts` cannot pull in anything that touches `node:fs`, `path`, or puppeteer, and that — not a preference for duplication — is what decides where the split falls. It shares [`markdownRenderer`](../../src/services/markdownRenderer.ts), [`themeManager`](../../src/services/themeManager.ts), [`utils/mermaid`](../../src/utils/mermaid.ts) and [`utils/printLayout`](../../src/utils/printLayout.ts), all of which stay free of node built-ins on purpose. It carries **its own copy of the HTML template**, because the desktop template is built around a webview the web build does not have.

That template is the project's sharpest edge: **a change to preview markup or styling is only half done until it is mirrored in `extension.web.ts`.** Markdown syntax is not — one renderer serves both, so a plugin added there reaches every target at once.

---

## 2. Module map

```
src/
  extension.ts            desktop activation: commands, tree view, status bar
  extension.web.ts        browser activation: preview + print-based export, self-contained
  providers/
    treeViewProvider.ts   TreeDataProvider — files, filter, per-file action groups
  services/
    markdownRenderer.ts   markdown-it + plugins + highlight.js -> HTML; shared with the web build
    previewManager.ts     the preview webview: panel lifecycle, CSP, link routing
    pdfExporter.ts        Chrome/puppeteer-core export — browser discovery, print layout
    webviewPdfExporter.ts browserless fallback export via html2pdf.js in a webview
    chromeLibraries.ts    Linux: which libraries Chrome lacks, and installing them
    katexAssets.ts        katex stylesheet: linked for webviews, inlined for Chrome
    themeManager.ts       theme presets + prettyMarkdown.colors overrides -> ThemeTokens
    exportSettings.ts     export timeouts: seconds in settings, milliseconds everywhere else
    settingsManager.ts    the settings webview: preview, export, action and palette controls
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

| Target | Images resolve to | Mermaid loaded from | katex CSS from | Finished when |
|---|---|---|---|---|
| Preview webview | `webview.asWebviewUri` | `asWebviewUri` | `asWebviewUri` | never — it renders live |
| Chrome export | `data:` URIs | `page.addScriptTag` | inlined, fonts as `data:` | `waitForFunction` on the ready flag |
| Browserless export | `data:` URIs | `asWebviewUri` | inlined, fonts as `data:` | ready flag polled before rasterising |

`renderMarkdown` takes a `resolveImage` hook rather than choosing a scheme itself, because Chrome refuses `file://` subresources in a page built with `setContent`, and the fallback webview may only read from the extension's own folder.

**Maths** is typeset at render time by [`@vscode/markdown-it-katex`](../../src/services/markdownRenderer.ts), so no script runs in the page and nothing has to be waited for. What does have to reach the page is katex's stylesheet and its fonts, and the same `setContent` restriction applies: [`katexAssets`](../../src/services/katexAssets.ts) links the vendored file for a webview and inlines it, fonts and all, for Chrome. Around 360 KB either way, so `containsMath()` decides whether it is worth sending at all.

**Everything the printer needs but the screen does not** is a script, not a stylesheet: `getPrintExpandScript()` opens collapsed `<details>` sections, then `getPrintFitScript()` measures. Both run in all three export paths, in that order.

**Colours** flow one way: settings -> `resolveTheme()` -> `ThemeTokens` -> CSS custom properties in `htmlGenerator`, plus mermaid theme variables. Never hardcode a colour in a template; add a token to `ThemeTokens`, give every preset a value, expose it in `package.json` under `prettyMarkdown.colors`, and read it as `var(--pm-*)`.

**Everything that runs in a webview is generated as a string** and injected under a nonce-based CSP. Any new inline script needs the same nonce and a matching CSP directive, or it silently does not run.

---

## 4. PDF export

Two engines, chosen at runtime. [`pdfExporter.ts`](../../src/services/pdfExporter.ts) drives Chrome through `puppeteer-core` (which ships no browser) and produces a real vector PDF with selectable text. It tries, in order: `PUPPETEER_EXECUTABLE_PATH`, the shared `~/.cache/puppeteer`, the legacy per-profile cache, a system Chrome, and only then an opt-in download — and a candidate that exists but fails to launch is skipped, not fatal.

When no Chrome can run, [`webviewPdfExporter.ts`](../../src/services/webviewPdfExporter.ts) converts the page with html2pdf.js inside a webview. The result is rasterised: no selectable text, roughly 3× the size. It is a fallback, never a default, and the user is always told why they got it.

On Linux a Chrome that exists can still refuse to start, because it links against system libraries a minimal image may not carry (`libnss3`, `libnspr4`, `libasound2`). [`chromeLibraries.ts`](../../src/services/chromeLibraries.ts) checks the linker rather than inferring from a launch failure — with no Chrome installed there is no failure to learn from, and a 185 MB download cannot supply a missing library. It offers the install once per machine, then leaves the offer on the notification that follows the fallback export.

Installing needs root. Where `sudo -n` already grants it the install runs unattended; otherwise the command goes into a terminal and the extension watches the linker until the libraries appear. Prompting for a password in a dialog and handing it to `sudo` is not something this extension does.

Both engines run to a budget from [`exportSettings.ts`](../../src/services/exportSettings.ts): `prettyMarkdown.exportTimeout` for laying the document out — Chrome's page load, or the whole conversion in the fallback — and `prettyMarkdown.diagramTimeout` for drawing diagrams. Zero means no limit, which is what puppeteer's own timeout options already take it to mean, so a configured value passes straight through. A document budget large enough to matter is the difference between a long file exporting and failing with Chrome's default 30-second navigation timeout, so a timeout that does reach the user names the setting that changes it.

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
| Markdown feature | `markdownRenderer.ts` alone — every target renders through it — plus CSS for whatever it emits |
| Export behaviour | `pdfExporter.ts` and, if it is layout, `printLayout.ts`; check the fallback still works |

---

## Related

- [local-development.md](local-development.md) — build, debug, package, dependency hygiene
- [release-workflow.md](../devdocs/release/release-workflow.md) — the four release steps
