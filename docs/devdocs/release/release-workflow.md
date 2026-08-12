# Release Workflow

Four steps, in order. Full build details live in [local-development.md](../../core/local-development.md).

---

## 1. Clean build and a fresh `.vsix`

```bash
rm -rf dist out media/vendor *.vsix
npm run check-types && npm run lint
npx vsce package --out vsix/pretty-markdown-<version>.vsix
```

`vsce` runs `vscode:prepublish` → `package-build`, so `dist/` and `media/vendor/` are rebuilt by esbuild in production mode. To try it locally:

```bash
code --install-extension vsix/pretty-markdown-<version>.vsix --force
```

## 2. Commit title

Run the **create-commit-title** prompt — `/create-commit-title.prompt` in Claude Code, or `.github/prompts/create-commit-title.prompt.md` in Copilot. It reads `git diff HEAD` and returns one Conventional Commits line, ready to paste.

## 3. Release title and notes

Run the **prepare-release** prompt — `/prepare-release.prompt`, or `.github/prompts/prepare-release.prompt.md`. It asks which CHANGELOG versions this release covers, then writes the title, the notes, and an entry in [releases.jsonc](releases.jsonc), and stamps `## [Unreleased]` with the version.

## 4. Bump, tag, push

```bash
npm version <version> --no-git-tag-version
git add -A && git commit -m "chore(release): v<version>"
git tag v<version>
git push && git push --tags
```

Tag names are `v` + the `package.json` version, e.g. `v1.6.0`.
