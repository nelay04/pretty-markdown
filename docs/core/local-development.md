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

`src/services/pdfExporter.ts` uses `puppeteer-core`, which ships **no** browser. On the first export the extension resolves the current stable Chrome build and downloads it into:

```
<globalStorageUri>/puppeteer/
```

Under the Extension Development Host, `globalStorageUri` points at a dev-profile path, not your normal VS Code storage — so the first PDF export during development triggers a fresh ~150 MB Chrome download, shown as a progress notification. It is cached after that, but note it is cached *per dev profile*, and wiping the dev profile means downloading again.

If you are offline or behind a proxy, that download is the thing that will fail. There is no setting to point at a local Chrome today — `getChromeExecutablePath()` always computes the path inside the cache dir.

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

## 8. Packaging a local build

```bash
npm run package        # vsce package -> pretty-markdown-<version>.vsix
code --install-extension pretty-markdown-1.4.0.vsix
```

`vscode:prepublish` runs `package-build`, so the packaged bundle is always minified and sourcemap-free. `.vsix` files are gitignored.

Uninstall the local build before going back to a marketplace version, or the two will conflict on the same extension id (`mistx.pretty-markdown`).

---

## 9. Troubleshooting

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
