# Changelog

All notable changes to the "Pretty Markdown" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned
- Export to HTML functionality
- Table of contents generation

## [1.8.0] - 16-08-2026

### Added
- **Export timeouts you can set**: A long or image-heavy document could fail with "Navigation timeout of 30000 ms exceeded" and nothing to show for the export. `prettyMarkdown.exportTimeout` now decides how long an export may spend laying the document out — two minutes by default, or `0` to wait for as long as it takes — and `prettyMarkdown.diagramTimeout` does the same for drawing its diagrams. Both apply to the built-in converter as well, and both can be set from the Pretty Markdown settings page.
- **Choose where the preview opens**: `prettyMarkdown.openPreviewIn` opens the preview in a new editor group beside the Markdown file, as it always has, as a tab in the editor group the file is already in, or in the file's own place. The last of those closes the file's editor, so the preview takes its tab.
- **Close Preview**: The preview's title bar carries a struck-through eye that closes it, and puts the file back when the preview replaced it. With the file's editor gone there is nothing for the eye that opened the preview to act on, so the way back needed a button of its own.

### Changed
- **A smaller extension, with no known vulnerable dependencies**: the library that downloads and unpacks Chrome was replaced with a version that no longer carries a vulnerable zip extractor. It brings six fewer packages with it, so the extension itself is around a third smaller to download. PDF export is unchanged.
- **The settings page follows the VS Code settings editor**: Every setting now carries a title, a description and its control in the same layout the built-in editor uses, with themed checkboxes, dropdowns and text boxes in place of the browser's own, and a bar down the left of any setting that no longer holds its default.

### Fixed
- **A timed-out export says what to do next**: The failure reached you as Chrome's own "Navigation timeout of 30000 ms exceeded", which named neither the document nor a way forward. It now says how long the export waited and which setting extends it.

## [1.7.0] - 15-08-2026

### Added
- **Maths**: LaTeX written as `$E = mc^2$` or in a `$$ ... $$` block is typeset with KaTeX, in the preview and in exported PDFs alike. The fonts travel with the export, so an equation looks the same on a machine that has never seen the document.
- **GitHub-flavoured alerts**: A blockquote starting with `[!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]` or `[!CAUTION]` is drawn as a titled callout, with an accent colour per kind that follows the theme and can be overridden through `prettyMarkdown.colors`.
- **Task lists**: `- [x]` and `- [ ]` render as checkboxes instead of literal brackets.
- **Footnotes**: `[^1]` references link to a numbered list at the foot of the document, with a link back to where you were reading.
- **Section links**: Every heading is given a GitHub-style anchor, so a hand-written table of contents now navigates both the preview and the exported PDF.
- **More inline syntax**: `==highlighted==` text, `H~2~O` subscripts and `x^2^` superscripts, plus styling for definition lists and `<kbd>` keys.
- **Offer to install Chrome's missing libraries (Linux)**: On a Linux machine where Chrome cannot start for want of system libraries, the export now offers to install them rather than only naming them. Package names are resolved from the distribution's own package manager, so Ubuntu 22.04 and 24.04 or later each get the right ones. Decline it and the export falls back as before; the offer returns as a button on the notification that follows, next to the reason it is worth taking.

### Changed
- **Front matter is no longer printed**: A YAML block at the top of a document was rendered as a rule and a wall of `title: ...` text. It is now treated as metadata and left out of the page.
- **Collapsed sections are exported open**: A `<details>` section folded away in the preview used to export as its summary line alone, losing the content inside it. Exports now expand every section first.
- **Themes have names**: The `default` and `dark` presets are now shown as **Pretty Light** and **Pretty Dark** in the settings page and in the VS Code settings editor. The values written to `settings.json` are unchanged, so existing configurations keep working.

### Fixed
- **Diagrams match the rest of a dark page**: On the Pretty Dark theme, diagrams were drawn on a white canvas inside a dark document, and clusters, notes and sequence actors each picked up a slightly different grey. Every diagram surface now comes from the theme, so a diagram is one flat colour with the page around it.
- **Exported PDFs are no longer framed in white**: A themed export left the page margins as bare white paper, which was clearly visible on Pretty Dark. The margins now carry the theme background, in both the Chrome and the built-in export.

## [1.6.0] - 12-08-2026

### Added
- **A choice for diagrams that cannot share a page**: When a diagram or image is too tall to fit in the space left on the page, the export asks whether to print it whole on the next page or to split it across the page break, and `prettyMarkdown.oversizedDiagrams` answers that once and for all.
- **Themes and per-component colours**: Choose between the `default`, `github`, `dark`, and `sepia` themes with `prettyMarkdown.theme`, and override any individual component — headings, links, code blocks, tables, blockquotes, diagrams, and each syntax-highlighting token — with `prettyMarkdown.colors`. The palette can also be edited with colour pickers in the Pretty Markdown settings page. The same colours are used by the preview, exported PDFs, and the web build, and the preview updates as soon as a colour changes.

### Changed
- **Wider text in exported PDFs**: The whitespace down each side of the page has been halved, from 15 mm to 7.5 mm.

### Fixed
- **Page-sized gaps in exported PDFs**: A diagram, image or code block taller than one printed page used to be pushed to a page of its own, leaving the rest of the previous page blank — a large diagram cost a near-empty page before it and another one after. Diagrams and images are now scaled to fit a page together with the heading that prints with them, code blocks break across pages instead of stranding one, and anything too tall to shrink and stay readable is printed across the page break.
- **Mermaid error graphic could still reach a PDF**: mermaid may replace a diagram block with its "Syntax error" image after rendering has already reported success, so the block is now restored to its source text immediately before the page is printed or rasterised.

## [1.5.0] - 12-08-2026

### Added
- **Mermaid diagrams**: ` ```mermaid ` and ` ```mmd ` code fences are rendered as diagrams in the preview, in exported PDFs, and in the web build. A diagram that fails to parse keeps its source text instead of breaking the document, and mermaid's "Syntax error" graphic is never drawn into the page.
- **Local images**: Images referenced relative to the Markdown file now load in the preview and are embedded in exported PDFs.
- **Clickable links in the preview**: Links to other Markdown files and workspace files open in the editor, and `http(s)`/`mailto` links open in the browser. In-page `#anchor` links still scroll within the preview.
- **PDF export without Chrome**: When no usable Chrome is available, the export falls back to the bundled converter instead of failing. The resulting PDF is an image, so its text is not selectable, and the reason is shown alongside it.

### Changed
- **Chrome is reused, not re-downloaded**: The browser is looked up in `PUPPETEER_EXECUTABLE_PATH`, the shared `~/.cache/puppeteer` cache, the previous per-profile cache, and finally the system installation. Any existing build is used instead of downloading the newest release, and downloads are shared across VS Code stable, Insiders, and the Extension Development Host.
- **The Chrome download is now opt-in**, shown with its size, and offered only on systems that can actually run Chrome.
- **Download progress** reports the real percentage and total size.

### Fixed
- **Export notification no longer sticks**: a browser that failed to exit kept the "Exporting to PDF..." notification on screen indefinitely. The browser is now closed with a timeout and force-terminated if needed, and is always released even when the save dialog is cancelled.
- **Interrupted browser downloads self-heal**: a partial download previously failed every later export with `end of central directory record signature not found`. The incomplete files are now cleared and the download is retried.
- **Missing Linux libraries are reported clearly**: instead of a raw loader error, the export names every missing library and the exact install command for the detected distribution (apt, dnf, or pacman).
- Security advisories in dependencies resolved; `npm audit` reports no vulnerabilities.

## [1.4.0] - 15-02-2026

### Added
- **Action explorer**: The tree view now exposes an actions section for the active Markdown file that lists runnable commands discovered from action code blocks, action comments, or dedicated Actions sections.
- **Action execution commands**: Added `Run Action`, `Pause/Resume Action`, `Stop Action`, and `Restart Action` commands plus a warning prompt that respects the per-file confirmation setting.
- **Action settings page**: A new settings webview lets you toggle the confirmation dialog and surfaces a safety badge when confirmation is disabled.

### Changed
- **Action controls**: Status bar items for pausing, stopping, or restarting the active action keep the runner controls close to the editor and show only when an action is running.
- **Action source preference**: When multiple action styles are detected in a file, a quick pick prompts you to choose which source types should appear in the view.

## [1.3.0] - 06-02-2026

### Added
- **Sidebar Tree View**: New sidebar panel labeled "Markdown Files" that displays all workspace Markdown files with file count metadata
- **Manual Refresh**: "Refresh Markdown Files" command in the view title dropdown for on-demand workspace rescanning
- **Indexing Status**: Animated status bar indicator that shows progress while indexing Markdown files
- **Embedded Search**: Persistent search item at the top of the tree view for real-time filtering of Markdown files
- **Persistent Search Input**: Search input box that stays open during filtering with live tree updates as you type


## [1.2.0] - 25-01-2026

### Added
- Web support for PDF export on vscode.dev using a browser-side PDF download flow.
- Web extension entry point with CSP-safe webview scripting for PDF export.

### Changed
- Documentation updated to reflect web PDF export support and behavior.


## [1.1.2] - 25-01-2026

### Fixed
- **PDF Export Download Path**: Chrome is now downloaded to the extension's global storage folder instead of the extension install directory. This eliminates missing `bin` and `chromium.br` errors on fresh devices.
- Reliable, automatic browser download on first export with no manual steps required.

### Changed
- Replaced runtime install hacks with a managed download using `@puppeteer/browsers`.
- Switched to `puppeteer-core` with explicit executable path for consistent behavior across devices.


## [1.1.1] - 25-01-2026

### Fixed
- **PDF Export Browser Installation**: Fixed extension packaging issue with @sparticuz/chromium. Switched back to regular puppeteer with automatic browser download on first use.
- Improved browser installation process with better error handling and user feedback
- Added fallback browser installation methods for better reliability

### Changed
- Replaced `@sparticuz/chromium` with regular `puppeteer` for better extension compatibility
- Enhanced progress messages during browser setup
- Added automatic browser download when needed


## [1.1.0] - 25-01-2026

### Fixed
- **PDF Export Now Works Out-of-the-Box**: Switched from `puppeteer` to `puppeteer-core` with `@sparticuz/chromium` bundled binary. Users no longer need to manually install Chrome - the extension works immediately after installation on any device.
- Fixed missing browser installation requirement that was preventing PDF export on fresh installations

### Changed
- Replaced `puppeteer` dependency with `puppeteer-core` and `@sparticuz/chromium` for better cross-platform compatibility
- Improved error handling for browser launch failures


## [1.0.1] - 24-01-2026

### Changed
- Version 1.0.1 now surfaces the shipped `media/icon.png` asset so VS Code/Marketplace display the extension's intended icon instead of the placeholder glyph.


## [1.0.0] - 24-01-2026

### Added
- Beautiful markdown preview with clean, professional styling
- One-click PDF export functionality using Puppeteer
- Real-time preview updates as you type
- Syntax highlighting for 190+ programming languages
- Responsive design optimized for both screen and print
- Zero-configuration setup - works out of the box
- Command palette integration with intuitive commands
- Keyboard shortcuts for quick access
- Custom color palette with "pretty-" prefixed variables
- Professional table styling with alternating row colors
- Enhanced blockquote styling
- Subtle link styling with hover effects

### Features
- **Preview Command**: `Pretty Markdown: Preview`
- **Export Command**: `Pretty Markdown: Export PDF`
- **Auto-refresh**: Preview updates automatically on document changes
- **Syntax Highlighting**: Support for JavaScript, Python, TypeScript, Bash, and more
- **Print Optimization**: Dedicated print styles for clean PDF output
- **Error Handling**: Comprehensive error messages and progress indicators

### Technical Details
- Built with TypeScript for type safety
- Uses markdown-it for robust markdown parsing
- Puppeteer integration for high-quality PDF generation
- highlight.js for syntax highlighting
- Optimized CSS with CSS Grid and Flexbox
- Responsive design with mobile-first approach

### Browser Compatibility
- Chrome/Chromium (via Puppeteer)
- Works in VS Code webview environment
- Print-friendly CSS for PDF export

### Performance
- Efficient rendering for large markdown files
- Minimal memory footprint
- Fast preview updates with debounced changes
- Optimized bundle size


## [0.0.1] - 23-01-2026

### Added
- Initial project setup
- Basic extension structure
- Development environment configuration

---

**Legend:**
- Styling/UI improvements
- Export functionality  
- Performance improvements
- Syntax highlighting
- Responsive/mobile improvements
- Configuration/setup
- Commands/shortcuts
- User experience
- Data/content display
- Text/content formatting
- Links/navigation
- Bug fixes
- Security improvements
- Documentation
- Testing