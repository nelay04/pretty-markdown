---
agent: 'agent'
description: 'Prepare a release title and release notes from the CHANGELOG, and log them in docs/devdocs/release/releases.jsonc'
---

# Prepare Release

## Purpose
Turn the CHANGELOG entries that have not been released yet into one release: a title, short release notes, and a record of both in `docs/devdocs/release/releases.jsonc`.

## Input to collect
- The release log, whose **last object is the most recent release**:
  ```@terminal
  cat docs/devdocs/release/releases.jsonc
  ```
- The CHANGELOG, which is the only source for what the release contains:
  ```@terminal
  cat CHANGELOG.md
  ```
- The version the extension currently ships as:
  ```@terminal
  node -e "console.log(require('./package.json').version)"
  ```

## How to find the candidates
1. From the log, take the **last object**: its `releaseName` is the version last released. An empty log means nothing has been released yet.
2. From the CHANGELOG, collect every `## [x.y.z]` section newer than that version, plus `## [Unreleased]` when it holds anything other than `### Planned`.
3. Those are the candidates. Anything at or below the last released version is behind us — a release that folded several versions together, or one that was skipped, is settled and never offered again. On the first run the log is empty, so every version is a candidate; that is expected.
4. If there are no candidates, say so and stop.

## How to decide what goes in
- Ask the user which candidates this release covers, as a **multi-select** question listing every candidate, newest first (`AskUserQuestion` with `multiSelect: true` where it exists). Do not guess; this is the one decision that is theirs.
- The release version is the **newest version the user selected**, and every selected entry is part of the release.
- When `Unreleased` is selected and is the newest, it has no number yet. Work one out from the current `package.json` version and what the selected entries contain — a `### Added` or `### Changed` section means a minor bump, `### Fixed` alone means a patch bump — then confirm that number with the user before using it.

## How to write the release
- **Title**: `Release v<version>`, e.g. `Release v0.100.2`. Nothing else on the line.
- **Notes**: brief Markdown, built only from the selected CHANGELOG entries — never from the diff, the commit log, or `### Planned`, which is a wishlist and not shipped work.
  - Keep the `### Added` / `### Changed` / `### Fixed` grouping, merging the same group across several selected versions.
  - One line per change, in the user-facing terms the CHANGELOG already uses. Shorten its wording; do not restate the mechanics.
  - Lead with what a user of the extension gets. Say which surface is affected — the preview, the PDF export, or the web build — when a change touches only one of them.

## How to log it
1. Take the timestamp by running exactly this, and use its output verbatim:
   ```@terminal
   node -e "console.log(new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date()).replace(/[,\s]+/g, '-'))"
   ```
2. Append one object to the array in `docs/devdocs/release/releases.jsonc`, keeping the newest last:
   ```jsonc
   {
     "releaseName": "1.7.0",
     "dated": "13-Aug-2026-01:47-am",
     "releaseTitle": "Release v1.7.0",
     "releaseNote": "### Added\n- ...\n\n### Fixed\n- ..."
   }
   ```
3. Stamp the CHANGELOG when `Unreleased` was part of the release: rename that heading to `## [<version>] - <DD-MM-YYYY>` and put a fresh `## [Unreleased]` above it, carrying `### Planned` over unchanged. Without this the same work is offered again next time.

## Final output
- Print the release title on its own line, then the release notes as Markdown, then the path of the log file you appended to. No commentary around them.

## Not in scope
Bumping the version in `package.json`, tagging, and publishing belong to the release commit (`chore(release): vX.Y.Z`), not to this prompt.
