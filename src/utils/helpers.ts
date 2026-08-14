import * as vscode from 'vscode';

/**
 * Get the display label for a markdown file in the tree view
 */
export function getMarkdownLabel(uri: vscode.Uri): string {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
    if (workspaceFolder) {
        return vscode.workspace.asRelativePath(uri, false);
    }
    // Not path.basename: this module is reached by the web bundle, which
    // cannot resolve node:path. A URI path is always '/'-separated.
    return uri.path.split('/').pop() || uri.path;
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
