import * as vscode from 'vscode';
import * as path from 'path';

/**
 * Get the display label for a markdown file in the tree view
 */
export function getMarkdownLabel(uri: vscode.Uri): string {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
    if (workspaceFolder) {
        return vscode.workspace.asRelativePath(uri, false);
    }
    return path.basename(uri.fsPath);
}

/**
 * Escape HTML special characters
 */
export function escapeHtml(text: string): string {
    const map: { [key: string]: string } = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
}
