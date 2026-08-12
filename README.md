# Pretty Markdown

A beautiful and feature-rich Markdown preview and PDF export extension for Visual Studio Code.

<!-- ![Pretty Markdown Logo](images/logo.png) -->

## Features

- **Beautiful Preview**: Clean, professional styling with syntax highlighting
- **PDF Export**: One-click export to high-quality PDF files
- **Themes and Colours**: Four built-in themes plus per-component colour overrides, applied to the preview and the PDF alike
- **Mermaid Diagrams**: `mermaid` code blocks render as diagrams in the preview and in exported PDFs
- **Local Images**: Images stored next to your Markdown file load in the preview and are embedded in the PDF
- **Clickable Links**: Jump to other Markdown files and workspace files straight from the preview
- **Web PDF Download**: Export PDF directly in vscode.dev
- **Live Preview**: Real-time preview updates as you type
- **Syntax Highlighting**: Code blocks with vibrant, readable colors
- **Responsive Design**: Optimized for both screen and print
- **Zero Configuration**: Works out of the box with sensible defaults
- **Action Explorer**: Detect runnable commands in Markdown files and execute them safely from the sidebar

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

### Action Commands

| Command | Description |
|---------|-------------|
| `Pretty Markdown: Run Action` | Execute the selected action from the sidebar actions list | |
| `Pretty Markdown: Pause or Resume Action` | Pause the running action (suspend terminal) or resume it | |
| `Pretty Markdown: Stop Action` | Stop the active action by sending a cancel signal | |
| `Pretty Markdown: Restart Action` | Re-run the most recent action with the same command | |
| `Pretty Markdown: Toggle Ask Confirmation Before Action` | Configure whether a confirmation dialog is shown before running actions | |
| `Pretty Markdown: Settings` | Open the dedicated action settings panel | |

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

## Action Execution

Pretty Markdown now surfaces runnable actions inside the tree view. When you select a Markdown file that contains action code blocks, action comments, or an `Actions` section, an **Actions** group appears beneath the file entry with every discovered command. Use the `Pretty Markdown: Run Action` command (or the play icon next to the action) to execute that entry in the dedicated `Pretty Markdown Actions` terminal. The extension prompts you before running anything when confirmations are enabled and also remembers which action sources you prefer when multiple styles are detected in the same file.

While an action is running, the status bar displays pause/resume, stop, and restart controls so you can manage the terminal without switching windows. The runner also keeps track of the last action so the `Restart Action` command can re-run the latest command quickly.

## Action Settings

Open `Pretty Markdown: Settings` (or `Toggle Ask Confirmation Before Action`) to view the standalone settings panel. The checkbox controls whether the extension asks for confirmation before launching actions and displays a safety badge when confirmation is turned off. Disabling the prompt is possible, but the panel reminds you that keeping it enabled helps prevent accidental destructive commands.

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
| Custom Themes | Supported | Four themes + per-component colours |

### Blockquotes
> Pretty Markdown makes your documentation look professional and polished, whether you're viewing it in VS Code or exporting to PDF.

## Configuration

Pretty Markdown works with zero configuration, and the colours can be changed when you want to.

| Setting | Description |
|---------|-------------|
| `prettyMarkdown.theme` | `default`, `github`, `dark`, or `sepia` |
| `prettyMarkdown.colors` | Per-component overrides applied on top of the theme |

Open **Pretty Markdown: Settings** to pick a theme and adjust individual colours with a colour picker, or edit them directly in `settings.json`:

```jsonc
{
  "prettyMarkdown.theme": "dark",
  "prettyMarkdown.colors": {
    "link": "#ff8800",
    "codeBackground": "#101010",
    "syntaxKeyword": "#c586c0"
  }
}
```

Every component can be themed: page background and body text, headings and the heading rule, links, inline code, code blocks, blockquotes, tables, horizontal rules, diagram backgrounds, and each syntax-highlighting token. The same palette is used by the preview and by exported PDFs.

Future versions will include:

- Font selection
- PDF page settings
- Export templates

## Requirements

- Visual Studio Code 1.60.0 or higher

PDF export uses Chrome for the best results — text stays selectable and searchable. Pretty Markdown reuses a Chrome already on your machine where possible, and offers a one-time download only when it can find none. If no Chrome can run, the export still works using a built-in converter; that PDF is an image, so its text cannot be selected.

On minimal Linux environments such as WSL or containers, Chrome needs a few system libraries. Pretty Markdown names the missing ones and the exact command for your distribution, for example:

```bash
sudo apt install -y libnspr4 libnss3 libasound2t64
```

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
