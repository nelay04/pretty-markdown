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

/** The file the preview took the place of, so closing it can give it back. */
let replacedDocumentUri: vscode.Uri | undefined;

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

/** Where the preview opens, matching prettyMarkdown.openPreviewIn. */
type PreviewLocation = 'beside' | 'active' | 'replace';

/**
 * Read on every open, so moving the setting moves the next preview without a
 * reload.
 */
function getPreviewLocation(resource?: vscode.Uri): PreviewLocation {
    const location = vscode.workspace
        .getConfiguration('prettyMarkdown', resource)
        .get<string>('openPreviewIn', 'beside');

    return location === 'active' || location === 'replace' ? location : 'beside';
}

function findSourceEditor(document: vscode.TextDocument): vscode.TextEditor | undefined {
    return vscode.window.visibleTextEditors.find(
        editor => editor.document.uri.toString() === document.uri.toString()
    );
}

/** The group the preview belongs in: a new one beside, or the file's own. */
function getPreviewColumn(location: PreviewLocation, document: vscode.TextDocument): vscode.ViewColumn {
    if (location === 'beside') {
        return vscode.ViewColumn.Beside;
    }

    return findSourceEditor(document)?.viewColumn || vscode.ViewColumn.Active;
}

/**
 * Give the preview the file's place in its group.
 *
 * A webview cannot be opened *as* an editor, so the panel is put in the same
 * group first and the file's tab closed after: closing it first would take the
 * group with it whenever the file is the only thing in it, and the preview
 * would open somewhere else entirely.
 */
async function closeSourceEditor(document: vscode.TextDocument): Promise<boolean> {
    const editor = findSourceEditor(document);
    if (!editor) {
        return false;
    }

    // closeActiveEditor is the only close there is; the tab has to be the
    // active one before it can be the one that closes.
    await vscode.window.showTextDocument(editor.document, { viewColumn: editor.viewColumn });
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    return true;
}

/**
 * Show or update the markdown preview panel
 */
export async function showPreview(document: vscode.TextDocument, context: vscode.ExtensionContext): Promise<void> {
    const location = getPreviewLocation(document.uri);
    const column = getPreviewColumn(location, document);

    if (previewPanel) {
        previewPanel.reveal(column);
        updatePreview(document, context);
    } else {
        previewPanel = vscode.window.createWebviewPanel(
            'prettyMarkdownPreview',
            'Markdown Preview',
            column,
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
            replacedDocumentUri = undefined;
        });

        updatePreview(document, context);
    }

    if (location === 'replace' && await closeSourceEditor(document)) {
        replacedDocumentUri = document.uri;
        // Closing the file leaves the focus wherever that group puts it next.
        previewPanel?.reveal();
    }
}

/**
 * Close the preview, and put back the file it was standing in for.
 *
 * Only an explicit close restores the file: closing the tab by hand is the
 * user closing a tab, and reopening a file they just closed would be the last
 * thing they asked for.
 */
export async function closePreview(): Promise<void> {
    const panel = previewPanel;
    if (!panel) {
        return;
    }

    const restore = replacedDocumentUri;
    const column = panel.viewColumn;
    panel.dispose();

    if (!restore) {
        return;
    }

    const document = await vscode.workspace.openTextDocument(restore);
    await vscode.window.showTextDocument(document, { viewColumn: column, preview: false });
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
