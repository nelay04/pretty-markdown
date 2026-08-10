import * as vscode from 'vscode';
import {
    PrettyMarkdownNode,
    PrettyMarkdownGroupItem,
    PrettyMarkdownFileItem,
    PrettyMarkdownActionsGroupItem,
    PrettyMarkdownActionItem,
    PrettyMarkdownWarningItem
} from '../types';
import { getMarkdownLabel } from '../utils/helpers';
import { ActionSourceType, MarkdownAction, scanMarkdownActions } from '../services/actionScanner';

/**
 * Tree data provider for Pretty Markdown file explorer
 */
export class PrettyMarkdownViewProvider implements vscode.TreeDataProvider<PrettyMarkdownNode> {
    private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<PrettyMarkdownNode | undefined>();
    readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;
    private markdownFiles: vscode.Uri[] = [];
    private activeMarkdownPath: string | undefined;
    private groupExpanded = true;
    private markdownCount = 0;
    private filterText = '';
    private actionGroupExpanded = true;
    private askConfirmationBeforeAction = true;
    private readonly actionCache = new Map<string, { version: number; actions: MarkdownAction[]; sources: Set<ActionSourceType> }>();
    private readonly actionSourcePreference = new Map<string, Set<ActionSourceType>>();

    constructor() {}

    refresh(): void {
        this.onDidChangeTreeDataEmitter.fire(undefined);
    }

    setFiles(files: vscode.Uri[]): void {
        this.markdownFiles = files;
        this.markdownCount = files.length;
        this.refresh();
    }

    setFilterText(filterText: string): void {
        this.filterText = filterText;
        void vscode.commands.executeCommand('setContext', 'prettyMarkdownFilterActive', this.filterText.trim().length > 0);
        this.refresh();
    }

    getFilterText(): string {
        return this.filterText;
    }

    setActiveFile(uri: vscode.Uri | undefined): void {
        this.activeMarkdownPath = uri?.fsPath;
        this.refresh();
    }

    invalidateActions(uri: vscode.Uri): void {
        this.actionCache.delete(uri.fsPath);
        this.refresh();
    }

    setGroupExpanded(isExpanded: boolean): void {
        this.groupExpanded = isExpanded;
        this.refresh();
    }

    setActionsGroupExpanded(isExpanded: boolean): void {
        this.actionGroupExpanded = isExpanded;
        this.refresh();
    }

    setAskConfirmationBeforeAction(enabled: boolean): void {
        this.askConfirmationBeforeAction = enabled;
        this.refresh();
    }

    getAskConfirmationBeforeAction(): boolean {
        return this.askConfirmationBeforeAction;
    }

    getTreeItem(element: PrettyMarkdownNode): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: PrettyMarkdownNode): Promise<PrettyMarkdownNode[]> {
        if (!element) {
            const visibleCount = this.getVisibleCount();
            const nodes: PrettyMarkdownNode[] = [
                new PrettyMarkdownGroupItem(this.groupExpanded, visibleCount, this.getTotalCount(), this.isFilterActive())
            ];

            const activeUri = this.getActiveUri();
            if (activeUri) {
                // Add the selected markdown file
                nodes.push(new PrettyMarkdownFileItem(activeUri, getMarkdownLabel(activeUri), true));
                
                // Add the actions group for the selected markdown
                const actions = await this.getActionsForUri(activeUri, false);
                nodes.push(new PrettyMarkdownActionsGroupItem(this.actionGroupExpanded, actions.length, getMarkdownLabel(activeUri)));
                if (!this.askConfirmationBeforeAction && actions.length > 0) {
                    nodes.push(new PrettyMarkdownWarningItem());
                }
            }

            return nodes;
        }

        if (element instanceof PrettyMarkdownGroupItem) {
            return this.getVisibleFiles().map((uri) => {
                const relativePath = getMarkdownLabel(uri);
                const isActive = this.activeMarkdownPath === uri.fsPath;
                return new PrettyMarkdownFileItem(uri, relativePath, isActive);
            });
        }

        if (element instanceof PrettyMarkdownActionsGroupItem) {
            const activeUri = this.getActiveUri();
            if (!activeUri) {
                return [];
            }
            const actions = await this.getActionsForUri(activeUri, true);
            return actions.map((action) => new PrettyMarkdownActionItem(action));
        }

        return [];
    }

    private getActiveUri(): vscode.Uri | undefined {
        if (!this.activeMarkdownPath) {
            return undefined;
        }
        return this.markdownFiles.find((uri) => uri.fsPath === this.activeMarkdownPath);
    }

    private getVisibleFiles(): vscode.Uri[] {
        const normalized = this.filterText.trim().toLowerCase();
        if (!normalized) {
            return this.markdownFiles;
        }
        return this.markdownFiles.filter((uri) => getMarkdownLabel(uri).toLowerCase().includes(normalized));
    }

    getVisibleCount(): number {
        return this.getVisibleFiles().length;
    }

    getTotalCount(): number {
        return this.markdownCount;
    }

    isFilterActive(): boolean {
        return this.filterText.trim().length > 0;
    }

    private isUriVisible(uri: vscode.Uri): boolean {
        if (!this.filterText.trim()) {
            return true;
        }
        return getMarkdownLabel(uri).toLowerCase().includes(this.filterText.trim().toLowerCase());
    }

    private async getActionsForUri(uri: vscode.Uri, allowPrompt: boolean): Promise<MarkdownAction[]> {
        const document = await vscode.workspace.openTextDocument(uri);
        const cached = this.actionCache.get(uri.fsPath);
        if (cached && cached.version === document.version) {
            return this.applySourcePreference(uri.fsPath, cached.actions, cached.sources, allowPrompt);
        }

        const scanResult = scanMarkdownActions(document.getText(), uri);
        this.actionCache.set(uri.fsPath, {
            version: document.version,
            actions: scanResult.actions,
            sources: scanResult.sources
        });

        return this.applySourcePreference(uri.fsPath, scanResult.actions, scanResult.sources, allowPrompt);
    }

    private async applySourcePreference(
        filePath: string,
        actions: MarkdownAction[],
        sources: Set<ActionSourceType>,
        allowPrompt: boolean
    ): Promise<MarkdownAction[]> {
        if (sources.size <= 1) {
            return actions;
        }

        const existingPreference = this.actionSourcePreference.get(filePath);
        if (!existingPreference && allowPrompt) {
            const options = [
                { label: 'Code blocks', description: '```sh / ```bash / ```powershell', value: 'code-block' as ActionSourceType },
                { label: 'Action comments', description: '<!-- action: ... -->', value: 'comment' as ActionSourceType },
                { label: 'Actions section', description: '## Actions list items', value: 'section' as ActionSourceType }
            ].filter((item) => sources.has(item.value));

            const selected = await vscode.window.showQuickPick(options, {
                canPickMany: true,
                placeHolder: 'Multiple action styles found. Choose which to treat as actions.'
            });

            if (selected && selected.length > 0) {
                this.actionSourcePreference.set(filePath, new Set(selected.map((item) => item.value)));
            } else {
                return actions;
            }
        }

        const preference = this.actionSourcePreference.get(filePath);
        if (!preference || preference.size === 0) {
            return actions;
        }
        return actions.filter((action) => preference.has(action.source));
    }
}
