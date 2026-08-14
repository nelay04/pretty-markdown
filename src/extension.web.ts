import * as vscode from 'vscode';
import { renderMarkdown, containsMath } from './services/markdownRenderer';
import { getMermaidBootScript } from './utils/mermaid';
import { getPrintExpandScript, getPrintFitScript, policyOf, OversizedBlockPolicy, OversizedBlockSetting } from './utils/printLayout';
import { resolveTheme, getThemeCssVariables, getMermaidThemeVariables, ThemeTokens } from './services/themeManager';

let previewPanel: vscode.WebviewPanel | undefined;

/** Page margins, in millimetres, of the A4 pages html2pdf produces. */
const pageMarginSideMm = 5;
const pageMarginBlockMm = 10;

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

    const unsupportedActionCommand = vscode.commands.registerCommand('pretty-markdown.runAction', () => {
        vscode.window.showErrorMessage('Markdown actions are not supported in the web extension.');
    });
    const unsupportedPauseCommand = vscode.commands.registerCommand('pretty-markdown.toggleActionPause', () => {
        vscode.window.showErrorMessage('Markdown actions are not supported in the web extension.');
    });
    const unsupportedStopCommand = vscode.commands.registerCommand('pretty-markdown.stopAction', () => {
        vscode.window.showErrorMessage('Markdown actions are not supported in the web extension.');
    });
    const unsupportedRestartCommand = vscode.commands.registerCommand('pretty-markdown.restartAction', () => {
        vscode.window.showErrorMessage('Markdown actions are not supported in the web extension.');
    });

    context.subscriptions.push(
        previewCommand,
        exportCommand,
        unsupportedActionCommand,
        unsupportedPauseCommand,
        unsupportedStopCommand,
        unsupportedRestartCommand
    );
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
    const mermaidUri = html.includes('<pre class="mermaid">')
        ? getMermaidScriptUri(previewPanel.webview, context)
        : undefined;
    // katex's stylesheet and fonts are only worth loading for a document that
    // has equations in it.
    const katexUri = containsMath(html)
        ? getKatexStylesheetUri(previewPanel.webview, context)
        : undefined;
    const nonce = getNonce();
    const theme = resolveTheme(document.uri);
    // The web build cannot ask mid-export, so it follows the setting as given.
    const policy = policyOf(vscode.workspace
        .getConfiguration('prettyMarkdown', document.uri)
        .get<OversizedBlockSetting>('oversizedDiagrams', 'ask'));
    previewPanel.webview.html = getWebviewContent(
        html, title, scriptUri, nonce, previewPanel.webview.cspSource, mermaidUri, theme, policy, katexUri
    );
}

function getDocumentTitle(document: vscode.TextDocument): string {
    const path = document.uri.path || '';
    const name = path.split('/').pop();
    return name && name.trim().length > 0 ? name : 'Preview';
}

function getHtml2PdfScriptUri(webview: vscode.Webview, context: vscode.ExtensionContext): vscode.Uri {
    return webview.asWebviewUri(
        vscode.Uri.joinPath(context.extensionUri, 'media', 'vendor', 'html2pdf.bundle.min.js')
    );
}

function getMermaidScriptUri(webview: vscode.Webview, context: vscode.ExtensionContext): vscode.Uri {
    return webview.asWebviewUri(
        vscode.Uri.joinPath(context.extensionUri, 'media', 'vendor', 'mermaid.min.js')
    );
}

function getKatexStylesheetUri(webview: vscode.Webview, context: vscode.ExtensionContext): vscode.Uri {
    return webview.asWebviewUri(
        vscode.Uri.joinPath(context.extensionUri, 'media', 'vendor', 'katex', 'katex.min.css')
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

function getWebviewContent(content: string, title: string, html2pdfUri: vscode.Uri, nonce: string, cspSource: string, mermaidUri?: vscode.Uri, theme?: ThemeTokens, policy: OversizedBlockPolicy = 'fit', katexUri?: vscode.Uri): string {
    const palette = theme || resolveTheme();

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} data:; style-src ${cspSource} 'unsafe-inline'; font-src ${cspSource} data:; script-src ${cspSource} 'nonce-${nonce}';">
    ${katexUri ? `<link rel="stylesheet" href="${katexUri}">` : ''}
    <style>
        :root {
${getThemeCssVariables(palette)}
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
            line-height: 1.5;
            color: var(--pm-text);
            background: var(--pm-background);
            padding: 20px;
            max-width: 800px;
            margin: 0 auto;
            font-size: 14px;
        }
        h1, h2,h3,h4,h5,h6 {
            margin: 16px 0 8px;
            font-weight: 500;
            line-height: 1.3;
            color: var(--pm-heading);
        }
        h1 {
            font-size: 1.75em;
            border-bottom: 1px solid var(--pm-heading-rule);
            padding-bottom: 6px;
            margin-bottom: 16px;
        }
        h2 { font-size: 1.5em; }
        h3 { font-size: 1.25em; }
        h4 { font-size: 1.1em; }
        h5, h6 { font-size: 1em; }
        p { margin: 8px 0; text-align: left; }
        a {
            color: var(--pm-link);
            text-decoration: none;
            border-bottom: 1px solid var(--pm-link);
        }
        a:hover {
            color: var(--pm-link-hover);
            border-bottom: 1px solid var(--pm-link-hover);
        }
        code {
            background: var(--pm-inline-code-background);
            padding: 2px 4px;
            border-radius: 2px;
            font-family: 'Consolas', 'Courier New', monospace;
            font-size: 0.85em;
            color: var(--pm-inline-code-text);
        }
        pre {
            background: var(--pm-code-background);
            color: var(--pm-code-text);
            padding: 12px;
            border-radius: 3px;
            overflow-x: auto;
            margin: 12px 0;
            border: 1px solid var(--pm-code-border);
            font-size: 0.85em;
            line-height: 1.4;
        }
        pre code { background: transparent; padding: 0; color: inherit; border: none; }
        .hljs-keyword { color: var(--pm-syntax-keyword); }
        .hljs-string { color: var(--pm-syntax-string); }
        .hljs-comment { color: var(--pm-syntax-comment); }
        .hljs-number { color: var(--pm-syntax-number); }
        .hljs-built_in { color: var(--pm-syntax-built-in); }
        .hljs-variable { color: var(--pm-syntax-variable); }
        .hljs-title { color: var(--pm-syntax-title); }
        .hljs-attr { color: var(--pm-syntax-attribute); }
        .hljs-selector-tag { color: var(--pm-syntax-keyword); }
        .hljs-selector-id { color: var(--pm-syntax-string); }
        .hljs-selector-class { color: var(--pm-syntax-number); }
        .hljs-literal { color: var(--pm-syntax-literal); }
        .hljs-function { color: var(--pm-syntax-function); }
        .hljs-punctuation { color: var(--pm-syntax-punctuation); }
        blockquote {
            border-left: 3px solid var(--pm-blockquote-border);
            padding-left: 12px;
            margin: 12px 0;
            color: var(--pm-blockquote-text);
            font-style: italic;
            background: var(--pm-blockquote-background);
            padding: 8px 12px;
        }
        ul, ol { margin: 8px 0; padding-left: 20px; }
        li { margin: 4px 0; }
        table {
            border-collapse: collapse;
            width: 100%;
            margin: 12px 0;
            background: var(--pm-table-background);
            border: 1px solid var(--pm-table-border);
            font-size: 0.9em;
        }
        th, td {
            border: 1px solid var(--pm-table-border);
            padding: 6px 8px;
            text-align: left;
        }
        th {
            background: var(--pm-table-header-background);
            font-weight: 500;
            color: var(--pm-heading);
        }
        tr:nth-child(even) { background: var(--pm-table-row-alternate); }
        img { max-width: 100%; height: auto; margin: 12px 0; }
        pre.mermaid { background: var(--pm-diagram-background); border: none; padding: 8px 0; margin: 12px 0; text-align: center; overflow-x: auto; page-break-inside: avoid; }
        pre.mermaid svg { max-width: 100%; height: auto; }
        pre.mermaid:not([data-processed]) { color: var(--pm-blockquote-text); font-family: 'Consolas', 'Courier New', monospace; font-size: 0.85em; text-align: left; }
        mark { background: var(--pm-mark-background); color: var(--pm-mark-text); padding: 0 2px; border-radius: 2px; }
        sub, sup { font-size: 0.75em; line-height: 0; }
        kbd {
            background: var(--pm-inline-code-background);
            color: var(--pm-text);
            border: 1px solid var(--pm-code-border);
            border-bottom-width: 2px;
            border-radius: 3px;
            padding: 1px 5px;
            font-family: 'Consolas', 'Courier New', monospace;
            font-size: 0.8em;
            white-space: nowrap;
        }
        dl { margin: 12px 0; }
        dt { font-weight: 600; color: var(--pm-heading); margin-top: 8px; }
        dd { margin: 2px 0 0 20px; color: var(--pm-blockquote-text); }
        details {
            border: 1px solid var(--pm-code-border);
            border-radius: 3px;
            padding: 8px 12px;
            margin: 12px 0;
            background: var(--pm-blockquote-background);
        }
        summary { cursor: pointer; font-weight: 500; color: var(--pm-heading); }
        details[open] > summary {
            margin-bottom: 8px;
            border-bottom: 1px solid var(--pm-code-border);
            padding-bottom: 6px;
        }
        ul.contains-task-list { list-style: none; padding-left: 2px; }
        li.task-list-item > label { display: inline; }
        .task-list-item-checkbox { margin-right: 6px; accent-color: var(--pm-link); vertical-align: -1px; }
        blockquote.pm-alert {
            font-style: normal;
            border-left-width: 4px;
            border-left-color: var(--pm-alert-accent);
        }
        .pm-alert-title { margin: 0 0 4px; font-weight: 600; color: var(--pm-alert-accent); }
        .pm-alert-note { --pm-alert-accent: var(--pm-alert-note); }
        .pm-alert-tip { --pm-alert-accent: var(--pm-alert-tip); }
        .pm-alert-important { --pm-alert-accent: var(--pm-alert-important); }
        .pm-alert-warning { --pm-alert-accent: var(--pm-alert-warning); }
        .pm-alert-caution { --pm-alert-accent: var(--pm-alert-caution); }
        .footnote-ref a { border-bottom: none; font-size: 0.85em; }
        .footnotes-sep { margin-top: 24px; }
        .footnotes { font-size: 0.9em; color: var(--pm-blockquote-text); }
        .footnotes-list { padding-left: 18px; }
        .footnote-item p { margin: 2px 0; }
        .footnote-backref { border-bottom: none; text-decoration: none; }
        .katex { color: var(--pm-text); }
        .katex-display { margin: 12px 0; overflow-x: auto; overflow-y: hidden; padding: 2px 0; }
        hr { border: none; border-top: 1px solid var(--pm-horizontal-rule); margin: 16px 0; }
        h1 + p, h2 + p, h3 + p, h4 + p, h5 + p, h6 + p { margin-top: 4px; }
        @media print {
            body { padding: 5mm 2.5mm; font-size: 11pt; line-height: 1.4; }
            h1, h2, h3, h4, h5, h6 { margin: 12pt 0 6pt; page-break-after: avoid; }
            p, li { margin: 4pt 0; }
            pre { page-break-inside: avoid; font-size: 9pt; }
            details, blockquote.pm-alert, .katex-display { page-break-inside: avoid; }
        }
    </style>
</head>
<body>
    <div id="content">
        ${content}
    </div>
    ${mermaidUri ? `<script nonce="${nonce}" src="${mermaidUri}"></script>` : ''}
    <script nonce="${nonce}" src="${html2pdfUri}"></script>
    <script nonce="${nonce}">
        ${mermaidUri && theme ? getMermaidBootScript({ variables: getMermaidThemeVariables(theme) }) : (mermaidUri ? getMermaidBootScript() : '')}

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

            // A section left collapsed would print as its summary alone.
            ${getPrintExpandScript()}

            // Blocks taller than a page would each cost a page-sized gap.
            ${getPrintFitScript({ marginSideMm: pageMarginSideMm, marginBlockMm: pageMarginBlockMm, rootSelector: '#content', policy })}

            html2pdf().set({
                filename,
                // Real page margins: this converter paginates by slicing one
                // tall image, and margins moved into the layout put the slice
                // boundaries out of step with the page height.
                margin: [${pageMarginBlockMm}, ${pageMarginSideMm}, ${pageMarginBlockMm}, ${pageMarginSideMm}],
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2, backgroundColor: ${JSON.stringify(palette.background)} },
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
