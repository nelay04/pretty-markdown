# Local Development

How to build, run, and debug **Pretty Markdown** from source.

---

## 1. Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Node.js | 18+ | `@types/node` is pinned to 16.x, but the toolchain (esbuild 0.27) needs 18+ |
| npm | 9+ | Lockfile is `package-lock.json` — use npm, not yarn/pnpm |
| VS Code | 1.60+ | Matches `engines.vscode` in `package.json` |

Recommended VS Code extensions (VS Code will prompt you — they come from `.vscode/extensions.json`):

- `dbaeumer.vscode-eslint`
- `connor4312.esbuild-problem-matchers` — required for the watch task's problem matcher
- `ms-vscode.extension-test-runner`

Install dependencies once:

```bash
npm install
```

---

## 2. The fast path — press F5

1. Open the repo folder in VS Code.
2. Press <kbd>F5</kbd> (or **Run and Debug → "Run Extension"**).

That launches the `Run Extension` config in `.vscode/launch.json`, which:

- runs the default build task (`watch`) first via `preLaunchTask`,
- opens a second VS Code window — the **Extension Development Host** — with the extension loaded from `--extensionDevelopmentPath=${workspaceFolder}`,
- attaches the debugger against `dist/**/*.js` source maps.

In the new window, open any `.md` file (`Test-Markdown.md` in this repo is a good sample) and try:

- `Ctrl+Shift+Q` — Preview
- `Ctrl+Shift+E` — Export PDF
- Command Palette → type `Pretty Markdown` for the full command list
- The **Pretty Markdown** icon in the Activity Bar for the tree view

> The `watch` task keeps running in the background. Leave it alone — it is what makes edit → reload cycles fast.

---

## 3. What the build actually does

`esbuild.js` bundles **two** entry points in one pass:

| Entry | Platform | Output | Used by |
|---|---|---|---|
| `src/extension.ts` | node | `dist/extension.js` | `main` — desktop VS Code |
| `src/extension.web.ts` | browser | `dist/extension.web.js` | `browser` — vscode.dev / github.dev |

`vscode` is marked external; everything else (markdown-it, highlight.js, puppeteer-core) is bundled. Sourcemaps are on unless `--production` is passed.

### Scripts

```bash
npm run watch          # esbuild watch + tsc --noEmit watch, in parallel (the F5 build task)
npm run watch:esbuild  # bundling only
npm run watch:tsc      # type errors only, emits nothing
npm run check-types    # one-shot tsc --noEmit
npm run lint           # eslint src
npm run fix            # eslint src --fix
npm run compile        # check-types + lint (no bundling)
npm run package-build  # minified production bundle -> dist/
npm run package        # vsce package -> .vsix
```

Note that `compile` does **not** produce `dist/` — only `watch:esbuild` and `package-build` do. If the Extension Development Host says the extension can't be found, `dist/extension.js` is probably missing; run `npm run package-build` once to prove the bundle builds.

---

## 4. The edit → see-it-work loop

1. Edit a file under `src/`.
2. esbuild rewrites `dist/` within ~100 ms.
3. In the Extension Development Host window, reload: **Developer: Reload Window** (`Ctrl+R`), or click the ↻ button in the debug toolbar of the main window.

Changes to `package.json` — new commands, menus, keybindings, activation events — are **not** picked up by a reload. Stop the debug session and press <kbd>F5</kbd> again.

### Where output goes

- `console.log` from the extension host → **Debug Console** of the *main* window.
- Errors inside the preview webview → in the Dev Host, run **Developer: Open Webview Developer Tools**.
- Breakpoints work directly in the `.ts` files thanks to sourcemaps.

---

## 5. PDF export in development

There are two export engines. Chrome is preferred because it produces a real vector PDF with selectable text; `src/services/webviewPdfExporter.ts` is the fallback for machines where Chrome cannot run, converting the page with html2pdf.js in a webview. That output is rasterised — no selectable text, and roughly 3× the file size (117 KB vs 36 KB on the sample document) — so it is only used when Chrome is unavailable, and the user is told why.

`src/services/pdfExporter.ts` uses `puppeteer-core`, which ships **no** browser. `launchChrome()` tries these in order and launches the first one that actually starts:

1. `PUPPETEER_EXECUTABLE_PATH`, if set and present — the escape hatch for offline machines and custom builds
2. The newest Chrome already in `PUPPETEER_CACHE_DIR` (default `~/.cache/puppeteer`), the cache shared with puppeteer itself
3. Chrome already in the legacy per-profile cache, `<globalStorageUri>/puppeteer/`
4. A system-installed Chrome, any release channel
5. Only if none of the above launches **and** the system can actually run Chrome: offer a one-time ~185 MB download, or the browserless fallback if the user declines

The download is offered only after `findMissingSystemLibraries()` confirms the machine has Chrome's required libraries (`libnspr4`, `libnss3`, `libnssutil3`, `libsmime3`, `libasound`), read from `ldconfig -p` plus `LD_LIBRARY_PATH`. Inferring this from a failed launch is not enough: on a machine with no Chrome at all there is no failure to learn from, so the user would spend the whole download on a browser that cannot start. WSL and container images are the usual case.

Two properties matter for development:

- **A candidate that exists but fails to launch is skipped, not fatal.** Missing system libraries, wrong architecture, a half-deleted install — each falls through to the next candidate.
- **The download target is deliberately outside `globalStorageUri`.** That path differs between VS Code stable, Insiders and the Extension Development Host, so caching there made each of them fetch its own ~700 MB copy. The shared cache means one download per machine, reused by the Dev Host.

So in a normal dev setup you usually get **no download at all** — the Dev Host reuses whatever Chrome is already on the machine.

### If a download breaks

An interrupted download leaves a build directory with no executable in it. Every later export then failed while unpacking:

```
All providers failed for chrome <version>:
 - DefaultProvider: end of central directory record signature not found
```

`downloadChrome()` now clears the partial directory before installing and retries once, and `cleanupLegacyBrowserCache()` prunes executable-less build directories from the old per-profile cache at activation. To clear it by hand:

```bash
rm -rf ~/.cache/puppeteer/chrome/<platform>-<version>
```

> **WSL note:** the system-Chrome lookup resolves to the Windows install (`/mnt/c/Program Files/Google/Chrome/Application/chrome.exe`). That binary cannot be driven from the Linux side, so `.exe` candidates are filtered out on non-Windows platforms.

The web build (`extension.web.ts`) has no puppeteer at all; it exports via the browser's own print pipeline.

---

## 6. Testing the web build

The `browser` entry point cannot be exercised with F5 — that runs the desktop host. To test it:

```bash
npx @vscode/test-web --extensionDevelopmentPath=. .
```

This opens vscode.dev-in-a-browser against the repo. Keep `npm run watch` running so `dist/extension.web.js` stays current.

---

## 7. Running tests

```bash
npm test   # runs pretest (compile + lint), then vscode-test
```

**Known gap:** `.vscode-test.mjs` looks for `out/test/**/*.test.js`, but no script compiles TypeScript into `out/` — `check-types` uses `--noEmit` and esbuild writes to `dist/`. As written, the test runner finds zero test files. Likewise `.vscode/tasks.json` references an `npm: watch-tests` task backed by a `watch-tests` script that does not exist in `package.json`. If you need the test suite, add a `tsc -p . --outDir out` compile step (or repoint `files` at a bundled test output) before relying on `npm test`.

---

## 8. Dependency hygiene

`npm audit` should report **0 vulnerabilities**. Two things keep it there, and both matter if you touch `package.json`:

**Never run `npm audit fix --force` on this repo.** It "fixes" the packaging and test tooling by *downgrading* them — `@vscode/vsce` → `vsce@1.25.1` and `@vscode/test-cli` → `0.0.11`. Upgrade the direct dependency instead.

**The `overrides` block is load-bearing:**

```json
"overrides": {
  "diff": "^8.0.4",
  "serialize-javascript": "^7.1.0",
  "tar-fs": "^3.1.1",
  "ws": "^8.21.0"
}
```

- `diff` / `serialize-javascript` patch advisories inside mocha, which pins older majors.
- `tar-fs` / `ws` patch the tree under `puppeteer-core`, which is deliberately held at **21.11.0**.

### Why puppeteer-core is pinned to 21.x

Do not bump `puppeteer-core` to 22+ casually. From v22 the launcher switched from `--headless` to `--headless=new` and added `--enable-features=PdfOopif`. On v24 the Chrome renderer segfaults mid-export under WSL2 — verified 0/3 successful exports on v24 versus 3/3 on 21.11.0, same Chrome build, same launch args. v24 additionally drops `'networkidle0'` from the accepted `setContent` values (it remains valid for `goto`), so [`pdfExporter.ts`](../../src/services/pdfExporter.ts) would need editing too.

If you do upgrade, actually export a PDF and confirm the file is written — a type-check and a build both pass while the export is broken.

## 9. Packaging a local build

```bash
npm run package        # @vscode/vsce -> pretty-markdown-<version>.vsix
code --install-extension pretty-markdown-1.4.0.vsix
```

`vscode:prepublish` runs `package-build`, so the packaged bundle is always minified and sourcemap-free. `.vsix` files are gitignored.

Both webview-based exporters load html2pdf from `media/vendor/html2pdf.bundle.min.js`, which `esbuild.js` copies out of `node_modules` on every build. That copy exists because `.vscodeignore` excludes `node_modules/**`: loading the library straight from `node_modules`, as the web build used to, works in the Extension Development Host but not from a packaged `.vsix`. `media/vendor/` is generated, so it is gitignored — run a build before packaging, which `vscode:prepublish` does for you.

Uninstall the local build before going back to a marketplace version, or the two will conflict on the same extension id (`mistx.pretty-markdown`).

---

## 10. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| F5 opens a window but no commands appear | `dist/` is missing or stale — check the watch task's terminal for `[watch] build finished` |
| New command not in the palette | `package.json` changed; restart the debug session rather than reloading |
| Preview renders but styling is wrong | Edit `src/utils/htmlGenerator.ts`; reload the Dev Host, then reopen the preview panel |
| PDF export hangs on "Downloading browser" | First-run Chrome download; needs network access to Google's storage host |
| Type errors that esbuild ignores | esbuild strips types without checking them — `npm run check-types` is what catches these |
| Stale `src/extension.js` / `src/*.js.map` | Leftover build artifacts checked into `src/`; they are not used by the esbuild pipeline and can be ignored |

---

## Related

- [`vsc-extension-quickstart.md`](../../vsc-extension-quickstart.md) — the generator's original notes
- [VS Code Extension API](https://code.visualstudio.com/api)
- [Bundling extensions](https://code.visualstudio.com/api/working-with-extensions/bundling-extension)
