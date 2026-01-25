import * as vscode from 'vscode';
import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';

let previewPanel: vscode.WebviewPanel | undefined;

export function activate(context: vscode.ExtensionContext) {
    console.log('Pretty Markdown (web) extension is now active!');

    const previewCommand = vscode.commands.registerCommand('pretty-markdown.preview', () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'markdown') {
            vscode.window.showErrorMessage('Please open a Markdown file first!');
            return;
        }

        showPreview(editor.document, context);
    });

    const exportCommand = vscode.commands.registerCommand('pretty-markdown.exportPDF', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'markdown') {
            vscode.window.showErrorMessage('Please open a Markdown file first!');
            return;
        }

        await exportToPDFWeb(editor.document, context);
    });

    vscode.workspace.onDidChangeTextDocument(event => {
        if (previewPanel && event.document.languageId === 'markdown') {
            updatePreview(event.document, context);
        }
    });

    context.subscriptions.push(previewCommand, exportCommand);
}

function showPreview(document: vscode.TextDocument, context: vscode.ExtensionContext) {
    if (previewPanel) {
        previewPanel.reveal(vscode.ViewColumn.Beside);
        updatePreview(document, context);
        return;
    }

    const documentDir = vscode.Uri.joinPath(document.uri, '..');

    previewPanel = vscode.window.createWebviewPanel(
        'prettyMarkdownPreview',
        'Markdown Preview',
        vscode.ViewColumn.Beside,
        {
            enableScripts: true,
            localResourceRoots: [documentDir, context.extensionUri]
        }
    );

    previewPanel.onDidDispose(() => {
        previewPanel = undefined;
    });

    updatePreview(document, context);
}

function updatePreview(document: vscode.TextDocument, context: vscode.ExtensionContext) {
    if (!previewPanel) {
        return;
    }

    const html = renderMarkdown(document.getText());
    const title = getDocumentTitle(document);
    const scriptUri = getHtml2PdfScriptUri(previewPanel.webview, context);
    const nonce = getNonce();
    previewPanel.webview.html = getWebviewContent(html, title, scriptUri, nonce, previewPanel.webview.cspSource);
}

function getDocumentTitle(document: vscode.TextDocument): string {
    const path = document.uri.path || '';
    const name = path.split('/').pop();
    return name && name.trim().length > 0 ? name : 'Preview';
}

function escapeHtml(text: string): string {
    const map: { [key: string]: string } = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
}

function renderMarkdown(markdown: string): string {
    const md = new MarkdownIt({
        html: true,
        linkify: true,
        typographer: true,
        highlight: (str: string, lang: string) => {
            if (lang && hljs.getLanguage(lang)) {
                try {
                    return `<pre class="hljs"><code>${hljs.highlight(str, { language: lang }).value}</code></pre>`;
                } catch (e) {
                    console.error(e);
                }
            }
            return `<pre class="hljs"><code>${escapeHtml(str)}</code></pre>`;
        }
    });

    return md.render(markdown);
}

function getHtml2PdfScriptUri(webview: vscode.Webview, context: vscode.ExtensionContext): vscode.Uri {
    return webview.asWebviewUri(
        vscode.Uri.joinPath(context.extensionUri, 'node_modules', 'html2pdf.js', 'dist', 'html2pdf.bundle.min.js')
    );
}

function getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

function getWebviewContent(content: string, title: string, html2pdfUri: vscode.Uri, nonce: string, cspSource: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} data:; style-src ${cspSource} 'unsafe-inline'; script-src ${cspSource} 'nonce-${nonce}';">
    <style>
        :root {
            --pretty-black: #000000;
            --pretty-dark-blue: #0000AA;
            --pretty-dark-green: #007c2b;
            --pretty-dark-cyan: #00AAAA;
            --pretty-dark-red: #AA0000;
            --pretty-dark-magenta: #AA00AA;
            --pretty-brown: #AA5500;
            --pretty-light-gray: #AAAAAA;
            --pretty-dark-gray: #555555;
            --pretty-blue: #5555FF;
            --pretty-green: #569cd6;
            --pretty-cyan: #ce9178;
            --pretty-red: #FF5555;
            --pretty-magenta: #ff3dff;
            --pretty-yellow: #f19130;
            --pretty-white: #FFFFFF;
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
            line-height: 1.5;
            color: #1a1a1a;
            background: #ffffff;
            padding: 20px;
            max-width: 800px;
            margin: 0 auto;
            font-size: 14px;
        }
        h1, h2,h3,h4,h5,h6 {
            margin: 16px 0 8px;
            font-weight: 500;
            line-height: 1.3;
            color: #000000;
        }
        h1 {
            font-size: 1.75em;
            border-bottom: 1px solid #cccccc;
            padding-bottom: 6px;
            margin-bottom: 16px;
        }
        h2 { font-size: 1.5em; }
        h3 { font-size: 1.25em; }
        h4 { font-size: 1.1em; }
        h5, h6 { font-size: 1em; }
        p { margin: 8px 0; text-align: left; }
        a {
            color: #333333;
            text-decoration: none;
            border-bottom: 1px solid #999999;
        }
        a:hover {
            color: #000000;
            border-bottom: 1px solid #333333;
        }
        code {
            background: #f5f7f9;
            padding: 2px 4px;
            border-radius: 2px;
            font-family: 'Consolas', 'Courier New', monospace;
            font-size: 0.85em;
            color: var(--pretty-dark-red);
        }
        pre {
            background: #f5f7f9;
            color: #1a1a1a;
            padding: 12px;
            border-radius: 3px;
            overflow-x: auto;
            margin: 12px 0;
            border: 1px solid #d0d8e0;
            font-size: 0.85em;
            line-height: 1.4;
        }
        pre code { background: transparent; padding: 0; color: inherit; border: none; }
        .hljs-keyword { color: var(--pretty-yellow); }
        .hljs-string { color: var(--pretty-green); }
        .hljs-comment { color: var(--pretty-dark-gray); }
        .hljs-number { color: var(--pretty-cyan); }
        .hljs-built_in { color: var(--pretty-magenta); }
        .hljs-variable { color: var(--pretty-blue); }
        .hljs-title { color: var(--pretty-red); }
        .hljs-attr { color: var(--pretty-dark-cyan); }
        .hljs-selector-tag { color: var(--pretty-yellow); }
        .hljs-selector-id { color: var(--pretty-green); }
        .hljs-selector-class { color: var(--pretty-cyan); }
        .hljs-literal { color: var(--pretty-magenta); }
        .hljs-function { color: var(--pretty-blue); }
        .hljs-punctuation { color: var(--pretty-light-gray); }
        blockquote {
            border-left: 3px solid #666666;
            padding-left: 12px;
            margin: 12px 0;
            color: #555555;
            font-style: italic;
            background: #f9f9f9;
            padding: 8px 12px;
        }
        ul, ol { margin: 8px 0; padding-left: 20px; }
        li { margin: 4px 0; }
        table {
            border-collapse: collapse;
            width: 100%;
            margin: 12px 0;
            background: #ffffff;
            border: 1px solid #cccccc;
            font-size: 0.9em;
        }
        th, td {
            border: 1px solid #cccccc;
            padding: 6px 8px;
            text-align: left;
        }
        th {
            background: #f5f5f5;
            font-weight: 500;
            color: #000000;
        }
        tr:nth-child(even) { background: #fafafa; }
        img { max-width: 100%; height: auto; margin: 12px 0; }
        hr { border: none; border-top: 1px solid #cccccc; margin: 16px 0; }
        h1 + p, h2 + p, h3 + p, h4 + p, h5 + p, h6 + p { margin-top: 4px; }
        @media print {
            body { padding: 5mm; font-size: 11pt; line-height: 1.4; }
            h1, h2, h3, h4, h5, h6 { margin: 12pt 0 6pt; page-break-after: avoid; }
            p, li { margin: 4pt 0; }
            pre { page-break-inside: avoid; font-size: 9pt; }
        }
    </style>
</head>
<body>
    <div id="content">
        ${content}
    </div>
    <script nonce="${nonce}" src="${html2pdfUri}"></script>
    <script nonce="${nonce}">
        window.addEventListener('message', (event) => {
            const message = event.data;
            if (!message || message.type !== 'export-pdf') {
                return;
            }

            const filename = message.filename || 'document.pdf';
            const element = document.getElementById('content');
            if (!element || typeof html2pdf === 'undefined') {
                return;
            }

            html2pdf().set({
                filename,
                margin: [10, 10, 10, 10],
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2 },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
            }).from(element).save();
        });
    </script>
</body>
</html>`;
}

async function exportToPDFWeb(document: vscode.TextDocument, context: vscode.ExtensionContext) {
    if (!previewPanel) {
        showPreview(document, context);
    }

    if (!previewPanel) {
        return;
    }

    updatePreview(document, context);

    const filename = `${getDocumentTitle(document).replace(/\.md$/i, '') || 'document'}.pdf`;

    setTimeout(() => {
        previewPanel?.webview.postMessage({ type: 'export-pdf', filename });
    }, 100);
}

export function deactivate() {}
