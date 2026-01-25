# Pretty Markdown

A beautiful and feature-rich Markdown preview and PDF export extension for Visual Studio Code.

![Pretty Markdown Logo](images/logo.png)

## Features

- **Beautiful Preview**: Clean, professional styling with syntax highlighting
- **PDF Export**: One-click export to high-quality PDF files
- **Web PDF Download**: Export PDF directly in vscode.dev
- **Live Preview**: Real-time preview updates as you type
- **Syntax Highlighting**: Code blocks with vibrant, readable colors
- **Responsive Design**: Optimized for both screen and print
- **Zero Configuration**: Works out of the box with sensible defaults

## Quick Start

1. Install the extension from the VS Code Marketplace
2. Open any `.md` file
3. Use `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac) to open the command palette
4. Type "Pretty Markdown" and select your desired action

## Commands

| Command | Description | Keyboard Shortcut |
|---------|-------------|-------------------|
| `Pretty Markdown: Preview` | Open live preview in side panel | `Ctrl+Shift+Q` |
| `Pretty Markdown: Export PDF` | Export current document to PDF | `Ctrl+Shift+E` |

## Usage Examples

### Opening Preview
```bash
# Method 1: Command Palette
Ctrl+Shift+P > "Pretty Markdown: Preview"

# Method 2: Right-click context menu
Right-click in markdown file > "Open Preview"
```

### Exporting to PDF
```bash
# Command Palette
Ctrl+Shift+P > "Pretty Markdown: Export PDF"
```

## Styling Features

### Code Highlighting
Pretty Markdown supports syntax highlighting for all major programming languages:

```javascript
function hello() {
    console.log("Beautiful syntax highlighting!");
}
```

```python
def greet(name):
    print(f"Hello, {name}!")
```

```bash
#!/bin/bash
echo "Terminal commands look great too!"
```

### Tables
| Feature | Status | Notes |
|---------|---------|-------|
| Preview | Supported | Real-time updates |
| PDF Export | Supported | High quality output |
| Syntax Highlighting | Supported | 190+ languages |
| Custom Themes | Planned | Coming soon |

### Blockquotes
> Pretty Markdown makes your documentation look professional and polished, whether you're viewing it in VS Code or exporting to PDF.

## Configuration

Currently, Pretty Markdown works with zero configuration. Future versions will include:

- Custom themes
- Font selection
- PDF page settings
- Export templates

## Requirements

- Visual Studio Code 1.60.0 or higher
- Node.js (for PDF export functionality)

## Installation

### From VS Code Marketplace
1. Open VS Code
2. Go to Extensions (`Ctrl+Shift+X`)
3. Search for "Pretty Markdown"
4. Click Install

### From VSIX
1. Download the `.vsix` file
2. Open VS Code
3. Go to Extensions (`Ctrl+Shift+X`)
4. Click "..." → "Install from VSIX..."
5. Select the downloaded file

## Troubleshooting

### Preview not updating
- Ensure you have a `.md` file open
- Try closing and reopening the preview
- Check that the document is saved

### PDF export fails
- Ensure you have write permissions to the target directory
- Check that Puppeteer dependencies are installed
- Restart VS Code if the issue persists

### PDF export on vscode.dev
- Export runs in the preview webview and downloads via the browser
- Some large documents may take longer to export in the browser

### Performance issues
- Large markdown files (>1MB) may take longer to process
- Consider splitting very large documents
- Close unused preview panels

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Setup
```bash
# Clone the repository
git clone https://github.com/nelay04/pretty-markdown

# Install dependencies
npm install

# Open in VS Code
code .

# Start development
npm run watch
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Built with [markdown-it](https://github.com/markdown-it/markdown-it)
- PDF generation powered by [Puppeteer](https://github.com/puppeteer/puppeteer)
- Syntax highlighting by [highlight.js](https://github.com/highlightjs/highlight.js)

## Stats

- Stars: Help us reach 100!
- Downloads: Be among the first!
- Issues: Report bugs to help us improve!

## Roadmap

- [ ] Custom theme support
- [ ] Export to HTML
- [ ] Table of contents generation
- [ ] Math equation support
- [ ] Mermaid diagram support
- [ ] Custom CSS injection
- [ ] Multi-language support

---

**Made with ❤️ for the VS Code community**

*If you find Pretty Markdown useful, please consider giving it a ⭐ on GitHub!*
