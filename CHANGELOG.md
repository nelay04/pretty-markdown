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