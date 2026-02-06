import * as vscode from 'vscode';
import { PrettyMarkdownNode, PrettyMarkdownGroupItem, PrettyMarkdownFileItem } from '../types';
import { getMarkdownLabel } from '../utils/helpers';

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

    setGroupExpanded(isExpanded: boolean): void {
        this.groupExpanded = isExpanded;
        this.refresh();
    }

    getTreeItem(element: PrettyMarkdownNode): vscode.TreeItem {
        return element;
    }

    getChildren(element?: PrettyMarkdownNode): PrettyMarkdownNode[] {
        if (!element) {
            const visibleCount = this.getVisibleCount();
            const nodes: PrettyMarkdownNode[] = [
                new PrettyMarkdownGroupItem(this.groupExpanded, visibleCount, this.getTotalCount(), this.isFilterActive())
            ];

            if (!this.groupExpanded) {
                const activeUri = this.getActiveUri();
                if (activeUri && this.isUriVisible(activeUri)) {
                    nodes.push(new PrettyMarkdownFileItem(activeUri, getMarkdownLabel(activeUri), true));
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
}
