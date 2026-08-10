import * as vscode from 'vscode';
import { MarkdownAction } from '../services/actionScanner';

export type PrettyMarkdownNode =
    | PrettyMarkdownGroupItem
    | PrettyMarkdownFileItem
    | PrettyMarkdownActionsGroupItem
    | PrettyMarkdownActionItem
    | PrettyMarkdownWarningItem;

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

export class PrettyMarkdownActionsGroupItem extends vscode.TreeItem {
    constructor(isExpanded: boolean, actionCount: number, fileLabel: string) {
        super('Actions', isExpanded ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed);
        this.id = 'prettyMarkdownActionsGroup';
        this.iconPath = new vscode.ThemeIcon('play-circle');
        this.contextValue = 'prettyMarkdownActionsGroup';
        const countLabel = `${actionCount} action${actionCount === 1 ? '' : 's'}`;
        this.description = `${countLabel} for ${fileLabel}`;
        this.tooltip = `Actions detected in ${fileLabel}`;
    }
}

export class PrettyMarkdownActionItem extends vscode.TreeItem {
    constructor(action: MarkdownAction) {
        super(action.title, vscode.TreeItemCollapsibleState.None);
        this.iconPath = new vscode.ThemeIcon('run');
        this.contextValue = 'prettyMarkdownAction';
        this.description = getActionDescription(action);
        this.tooltip = action.command;
        this.command = {
            command: 'pretty-markdown.runAction',
            title: 'Run Action',
            arguments: [action]
        };
    }
}

export class PrettyMarkdownWarningItem extends vscode.TreeItem {
    constructor() {
        super('Actions now run immediately without confirmation', vscode.TreeItemCollapsibleState.None);
        this.id = 'prettyMarkdownActionsWarning';
        this.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('charts.yellow'));
        this.contextValue = 'prettyMarkdownWarning';
        this.tooltip = 'Actions will be executed right away because confirmation prompts are disabled.';
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

function getActionDescription(action: MarkdownAction): string {
    const parts: string[] = [];
    if (action.source === 'code-block') {
        parts.push(action.language ? `code block (${action.language})` : 'code block');
        // Show abbreviated command preview for better visibility
        const cmdPreview = action.command.length > 50 
            ? action.command.substring(0, 50) + '...' 
            : action.command;
        parts.push(cmdPreview);
    } else if (action.source === 'comment') {
        parts.push('comment');
    } else {
        parts.push('section');
    }
    parts.push(`line ${action.line}`);
    return parts.join(' - ');
}
