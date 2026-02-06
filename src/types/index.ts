import * as vscode from 'vscode';

export type PrettyMarkdownNode = PrettyMarkdownGroupItem | PrettyMarkdownFileItem;

export class PrettyMarkdownGroupItem extends vscode.TreeItem {
    constructor(isExpanded: boolean, visibleCount: number, totalCount: number, isFiltered: boolean) {
        super('Markdown Files', isExpanded ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed);
        this.id = 'prettyMarkdownGroup';
        this.iconPath = new vscode.ThemeIcon('list-unordered');
        this.contextValue = 'prettyMarkdownGroup';
        this.description = getCountDescription(visibleCount, totalCount, isFiltered);
    }
}

export class PrettyMarkdownFileItem extends vscode.TreeItem {
    constructor(uri: vscode.Uri, label: string, isActive: boolean) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.resourceUri = uri;
        this.command = {
            command: 'vscode.open',
            title: 'Open Markdown File',
            arguments: [uri]
        };
        this.iconPath = isActive
            ? new vscode.ThemeIcon('check', new vscode.ThemeColor('testing.iconPassed'))
            : new vscode.ThemeIcon('file-text');
        this.contextValue = isActive ? 'prettyMarkdownActive' : 'prettyMarkdownInactive';
        this.description = isActive ? 'selected' : undefined;
    }
}

function getCountDescription(visibleCount: number, totalCount: number, isFiltered: boolean): string | undefined {
    if (totalCount <= 0) {
        return '0 files';
    }
    if (isFiltered && visibleCount !== totalCount) {
        return `${visibleCount}/${totalCount} files`;
    }
    return `${totalCount} file${totalCount === 1 ? '' : 's'}`;
}
