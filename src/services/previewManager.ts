import * as vscode from 'vscode';
import * as path from 'path';
import { renderMarkdown, containsMermaid, containsMath } from './markdownRenderer';
import { getWebviewContent } from '../utils/htmlGenerator';
import { getMermaidBootScript } from '../utils/mermaid';
import { resolveTheme, getMermaidThemeVariables } from './themeManager';
import { getKatexStylesheetTag } from './katexAssets';

let previewPanel: vscode.WebviewPanel | undefined;
let previewDocumentUri: vscode.Uri | undefined;
let messageSubscription: vscode.Disposable | undefined;

function getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

/**
 * Folders the webview is allowed to load images from: the document's own
 * folder, every workspace folder, and the extension (for mermaid).
 */
function getLocalResourceRoots(document: vscode.TextDocument, context: vscode.ExtensionContext): vscode.Uri[] {
    const roots = [
        vscode.Uri.file(path.dirname(document.fileName)),
        context.extensionUri
    ];

    for (const folder of vscode.workspace.workspaceFolders || []) {
        roots.push(folder.uri);
    }

    return roots;
}

/**
 * Resolve a link or image written relative to the markdown file.
 */
function resolveRelativePath(document: vscode.TextDocument, target: string): vscode.Uri {
    const documentDir = path.dirname(document.fileName);

    if (target.startsWith('/')) {
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
        if (workspaceFolder) {
            return vscode.Uri.joinPath(workspaceFolder.uri, target.slice(1));
        }
    }

    return vscode.Uri.file(path.resolve(documentDir, target));
}

/**
 * Open whatever a preview link points at: a markdown file, another file in the
 * workspace, or an external URL.
 */
async function openLinkTarget(document: vscode.TextDocument, href: string): Promise<void> {
    if (/^(https?|mailto):/i.test(href)) {
        await vscode.env.openExternal(vscode.Uri.parse(href));
        return;
    }

    // Strip a heading anchor or query before touching the filesystem.
    const [rawPath] = href.split(/[?#]/);
    if (!rawPath) {
        return;
    }

    let target: vscode.Uri;
    try {
        target = resolveRelativePath(document, decodeURIComponent(rawPath));
    } catch {
        target = resolveRelativePath(document, rawPath);
    }

    try {
        await vscode.workspace.fs.stat(target);
    } catch {
        vscode.window.showWarningMessage(`Cannot open "${rawPath}" — the file was not found.`);
        return;
    }

    // vscode.open picks the right editor for the file type, and hands
    // binaries such as PDFs to the appropriate viewer.
    await vscode.commands.executeCommand('vscode.open', target, { viewColumn: vscode.ViewColumn.One });
}

/**
 * Show or update the markdown preview panel
 */
export function showPreview(document: vscode.TextDocument, context: vscode.ExtensionContext) {
    if (previewPanel) {
        previewPanel.reveal(vscode.ViewColumn.Beside);
        updatePreview(document, context);
        return;
    }

    previewPanel = vscode.window.createWebviewPanel(
        'prettyMarkdownPreview',
        'Markdown Preview',
        vscode.ViewColumn.Beside,
        {
            enableScripts: true,
            localResourceRoots: getLocalResourceRoots(document, context)
        }
    );

    messageSubscription = previewPanel.webview.onDidReceiveMessage(async (message) => {
        if (!message || message.type !== 'open-link' || typeof message.href !== 'string') {
            return;
        }

        // Resolve against the document currently shown, which may differ from
        // the one the panel was opened with.
        let source = document;
        if (previewDocumentUri) {
            try {
                source = await vscode.workspace.openTextDocument(previewDocumentUri);
            } catch {
                // Fall back to the document the preview was opened with.
            }
        }

        await openLinkTarget(source, message.href);
    });

    previewPanel.onDidDispose(() => {
        messageSubscription?.dispose();
        messageSubscription = undefined;
        previewPanel = undefined;
        previewDocumentUri = undefined;
    });

    updatePreview(document, context);
}

/**
 * Update the preview panel with the latest content
 */
export function updatePreview(document: vscode.TextDocument, context: vscode.ExtensionContext) {
    if (!previewPanel) {
        return;
    }

    const webview = previewPanel.webview;
    previewDocumentUri = document.uri;

    const html = renderMarkdown(document.getText(), {
        resolveImage: (src) => {
            try {
                return webview.asWebviewUri(resolveRelativePath(document, decodeURIComponent(src))).toString();
            } catch {
                return src;
            }
        }
    });

    const nonce = getNonce();
    const theme = resolveTheme(document.uri);
    const needsMermaid = containsMermaid(html);
    const mermaidUri = webview.asWebviewUri(
        vscode.Uri.joinPath(context.extensionUri, 'media', 'vendor', 'mermaid.min.js')
    );

    const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; ` +
        `img-src ${webview.cspSource} data: https: http:; style-src 'unsafe-inline' ${webview.cspSource}; ` +
        `font-src ${webview.cspSource} data:; script-src 'nonce-${nonce}';">`;

    // katex's stylesheet and fonts are only worth loading for a document that
    // has equations in it.
    const head = containsMath(html)
        ? `${csp}\n    ${getKatexStylesheetTag(webview, context.extensionUri)}`
        : csp;

    const scripts = `${needsMermaid ? `    <script nonce="${nonce}" src="${mermaidUri}"></script>\n` : ''}    <script nonce="${nonce}">
${needsMermaid ? getMermaidBootScript({ variables: getMermaidThemeVariables(theme) }) : ''}
        (function () {
            const vscodeApi = acquireVsCodeApi();

            document.addEventListener('click', (event) => {
                const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
                if (!anchor) {
                    return;
                }

                const href = anchor.getAttribute('href') || '';

                // In-page anchors keep the webview's own scrolling behaviour.
                if (href.startsWith('#')) {
                    return;
                }

                event.preventDefault();
                vscodeApi.postMessage({ type: 'open-link', href });
            });
        })();
    </script>`;

    webview.html = getWebviewContent(html, 'Preview', { head, scripts, theme });
}

/**
 * Get the current preview panel
 */
export function getPreviewPanel(): vscode.WebviewPanel | undefined {
    return previewPanel;
}
