# Pretty Markdown — Working Instructions

Shared instructions for every AI assistant on this repo. `CLAUDE.md` at the root and `.github/copilot-instructions.md` are symlinks to this file — edit it here, once.

A VS Code extension (`mistx.pretty-markdown`) that renders beautiful Markdown previews and exports them to PDF. TypeScript, bundled with esbuild, published to the Marketplace.

---

## Read first

| Topic | Document |
|---|---|
| Modules, render pipeline, boundaries | [docs/core/architecture.md](docs/core/architecture.md) |
| Build, debug, package, dependency hygiene | [docs/core/local-development.md](docs/core/local-development.md) |
| Cutting a release | [docs/devdocs/release/release-workflow.md](docs/devdocs/release/release-workflow.md) |

Read the architecture document before changing anything under `src/`. The three points that catch people out are the desktop/web split, the theme-token flow, and the two PDF engines.

## Commands

```bash
npm run check-types    # tsc --noEmit — esbuild strips types without checking them
npm run lint           # eslint src
npm run compile        # check-types + lint; does NOT produce dist/
npm run watch          # the F5 build task: esbuild + tsc, in parallel
npm run package-build  # production bundle -> dist/
```

Run `npm run check-types && npm run lint` before calling any change done. A green build is not evidence that an export works — for anything touching the PDF path, export a real PDF and confirm the file exists.

## Code standards

- **TypeScript, `strict`.** No `any` to silence the compiler, no `@ts-ignore` without a comment saying why.
- **4 spaces** in `src/`, tabs in `esbuild.js` and `tsconfig.json`. Single quotes, semicolons, `===`, braces on every `if`. ESLint enforces the last four.
- **camelCase / PascalCase** — the naming-convention rule rejects anything else outside quoted object keys.
- Exported functions and non-obvious types get a short JSDoc line. Prefer a `/** ... */` on the type over a paragraph at the call site.
- Comments explain **why**, never what. The good ones in this repo record a constraint someone paid for — a pinned version, a CSP rule, a WSL quirk. Match that bar or write nothing.
- Errors reaching the user are messages with a next step, not stack traces. Never fail silently.
- No new runtime dependency without a reason in the PR description. The bundle ships to every user.
- Prose in docs, settings and messages uses British spelling (`colour`), matching the existing text.

## Do

- Keep `extension.ts` to registration and wiring; put logic in `services/`.
- Mirror preview markup, styling and Markdown changes into `extension.web.ts` — it carries its own renderer and template on purpose.
- Add colours as `ThemeTokens` entries with a value in all four presets, a `package.json` schema entry, and a `var(--pm-*)` reference. Never hardcode one.
- Give every injected webview script the page nonce and a matching CSP directive.
- Treat a candidate that fails (a browser that will not launch, a diagram that will not parse) as a fallback, not a fatal error. One bad block must never cost the whole document.
- Dispose what you create: panels, watchers, status bar items, event subscriptions.
- Update `CHANGELOG.md` in the same change as the behaviour.

## Do not

- Do not run `npm audit fix --force` — it downgrades `@vscode/vsce` and `@vscode/test-cli`. Upgrade the direct dependency instead.
- Do not bump `puppeteer-core` past 21.x. v24 segfaults mid-export under WSL2; the reasoning is in [local-development.md](docs/core/local-development.md#9-dependency-hygiene).
- Do not remove entries from the `overrides` block in `package.json`. They are what keeps `npm audit` at zero.
- Do not run a scanned Markdown action without the confirmation prompt or an explicit user opt-out. It executes shell commands from an open document.
- Do not import `node:fs`, `path` or puppeteer into anything the web bundle reaches.
- Do not edit `dist/`, `media/vendor/`, or the stale `src/*.js` build artifacts — all generated.
- Do not bump the version in `package.json` by hand, or commit and push unless asked.
- Do not add emoji to code, comments, commit messages or documentation. VS Code `$(icon)` codicons in the UI are fine.

## Changelog

`CHANGELOG.md` follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) and semver. Every user-visible change lands under `## [Unreleased]` in `Added` / `Changed` / `Fixed` / `Removed`, in the same commit as the code.

Entries are written for users, not for reviewers: a bold summary, then a sentence saying what changed and what it means for them. Name the setting or command involved. Refactors, build tweaks and internal cleanups do not belong here.

```markdown
### Fixed
- **Export notification no longer sticks**: a browser that failed to exit kept the "Exporting to PDF..." notification on screen indefinitely. The browser is now closed with a timeout and force-terminated if needed.
```

Version dates are `DD-MM-YYYY`. `## [Unreleased]` is stamped with the version at release time by the prepare-release prompt — not by hand.

## Releases

Four steps, in order, in [release-workflow.md](docs/devdocs/release/release-workflow.md). Two prompts do the writing and exist in both Claude Code and Copilot form:

- `/create-commit-title.prompt` — one Conventional Commits line (<= 80 chars) for the local diff.
- `/prepare-release.prompt` — release title, notes, an entry in `docs/devdocs/release/releases.jsonc`, and the CHANGELOG stamp.

Commit messages follow Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`). Tags are `v` + the `package.json` version.

## Documentation

Docs live in `docs/`: `core/` for anything a contributor needs to build or understand the extension, `devdocs/` for process and release records. `README.md` is the Marketplace listing — user-facing only.

When behaviour and a document disagree, fix the document in the same change. Prefer editing an existing file over adding a new one; a new document needs a link from a related page or it will not be found.