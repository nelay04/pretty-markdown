import * as vscode from 'vscode';
import * as path from 'path';
import { renderMarkdown } from './markdownRenderer';
import { getWebviewContent } from '../utils/htmlGenerator';

let previewPanel: vscode.WebviewPanel | undefined;

/**
 * Show or update the markdown preview panel
 */
export function showPreview(document: vscode.TextDocument, context: vscode.ExtensionContext) {
    if (previewPanel) {
        previewPanel.reveal(vscode.ViewColumn.Beside);
        updatePreview(document, context);
    } else {
        previewPanel = vscode.window.createWebviewPanel(
            'prettyMarkdownPreview',
            'Markdown Preview',
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                localResourceRoots: [vscode.Uri.file(path.dirname(document.fileName))]
            }
        );

        previewPanel.onDidDispose(() => {
            previewPanel = undefined;
        });

        updatePreview(document, context);
    }
}

/**
 * Update the preview panel with the latest content
 */
export function updatePreview(document: vscode.TextDocument, context: vscode.ExtensionContext) {
    if (!previewPanel) {
        return;
    }

    const html = renderMarkdown(document.getText());
    previewPanel.webview.html = getWebviewContent(html, 'Preview');
}

/**
 * Get the current preview panel
 */
export function getPreviewPanel(): vscode.WebviewPanel | undefined {
    return previewPanel;
}
