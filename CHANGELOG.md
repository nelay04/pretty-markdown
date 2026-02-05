# Changelog

All notable changes to the "Pretty Markdown" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned
- Custom theme support
- Export to HTML functionality
- Table of contents generation
- Math equation rendering
- Mermaid diagram support

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