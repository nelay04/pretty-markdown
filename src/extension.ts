import * as vscode from 'vscode';
import { PrettyMarkdownViewProvider } from './providers/treeViewProvider';
import { PrettyMarkdownGroupItem } from './types';
import { showPreview, updatePreview, getPreviewPanel } from './services/previewManager';
import { exportToPDF } from './services/pdfExporter';
import { getMarkdownLabel } from './utils/helpers';

export function activate(context: vscode.ExtensionContext) {
    console.log('Pretty Markdown extension is now active!');

    const viewProvider = new PrettyMarkdownViewProvider();
    const treeView = vscode.window.createTreeView('prettyMarkdownView', {
        treeDataProvider: viewProvider,
        showCollapseAll: false
    });
    void vscode.commands.executeCommand('setContext', 'prettyMarkdownFilterActive', false);

    const indexingStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    indexingStatusBar.text = '$(sync~spin) Pretty Markdown is indexing...';
    indexingStatusBar.tooltip = 'Calibrating the Markdown file catalog';
    indexingStatusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.prominentBackground');
    indexingStatusBar.hide();

    const refreshMarkdownFiles = async () => {
        indexingStatusBar.text = '$(sync~spin) Pretty Markdown is indexing...';
        indexingStatusBar.show();
        try {
            const files = await vscode.workspace.findFiles(
                '**/*.md',
                '**/{node_modules,.git,dist,out,coverage}/**'
            );
            files.sort((a, b) => getMarkdownLabel(a).localeCompare(getMarkdownLabel(b)));
            viewProvider.setFiles(files);
        } finally {
            indexingStatusBar.hide();
        }
    };

    const scheduleRefresh = () => {
        void refreshMarkdownFiles();
    };

    const updateActiveMarkdown = (editor: vscode.TextEditor | undefined) => {
        if (editor?.document.languageId === 'markdown') {
            viewProvider.setActiveFile(editor.document.uri);
        } else {
            viewProvider.setActiveFile(undefined);
        }
    };

    // Register preview command
    const previewCommand = vscode.commands.registerCommand('pretty-markdown.preview', () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'markdown') {
            vscode.window.showErrorMessage('Please open a Markdown file first!');
            return;
        }

        showPreview(editor.document, context);
    });

    // Register PDF export command
    const exportCommand = vscode.commands.registerCommand('pretty-markdown.exportPDF', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'markdown') {
            vscode.window.showErrorMessage('Please open a Markdown file first!');
            return;
        }

        await exportToPDF(editor.document, context);
    });

    // Auto-update preview on document change
    vscode.workspace.onDidChangeTextDocument(event => {
        if (getPreviewPanel() && event.document.languageId === 'markdown') {
            updatePreview(event.document, context);
        }
    });

    const markdownWatcher = vscode.workspace.createFileSystemWatcher('**/*.md');
    markdownWatcher.onDidCreate(scheduleRefresh);
    markdownWatcher.onDidDelete(scheduleRefresh);
    markdownWatcher.onDidChange(scheduleRefresh);

    const workspaceFolderWatcher = vscode.workspace.onDidChangeWorkspaceFolders(scheduleRefresh);
    const activeEditorWatcher = vscode.window.onDidChangeActiveTextEditor(updateActiveMarkdown);
    const treeCollapseWatcher = treeView.onDidCollapseElement(event => {
        if (event.element instanceof PrettyMarkdownGroupItem) {
            viewProvider.setGroupExpanded(false);
        }
    });
    const treeExpandWatcher = treeView.onDidExpandElement(event => {
        if (event.element instanceof PrettyMarkdownGroupItem) {
            viewProvider.setGroupExpanded(true);
        }
    });
    const refreshCommand = vscode.commands.registerCommand('pretty-markdown.refreshFiles', () => {
        void refreshMarkdownFiles();
    });

    const searchCommand = vscode.commands.registerCommand('pretty-markdown.searchFiles', () => {
        const inputBox = vscode.window.createInputBox();
        inputBox.title = 'Search Markdown Files';
        inputBox.placeholder = 'Type to filter the list';
        inputBox.ignoreFocusOut = true;
        inputBox.value = viewProvider.getFilterText();

        inputBox.onDidChangeValue((value) => {
            viewProvider.setFilterText(value);
        });

        inputBox.onDidAccept(() => {
            inputBox.hide();
        });

        inputBox.onDidHide(() => {
            if (!inputBox.value.trim()) {
                viewProvider.setFilterText('');
            }
            inputBox.dispose();
        });

        inputBox.show();
    });

    const showFilterInfoCommand = vscode.commands.registerCommand('pretty-markdown.showFilterInfo', () => {
        const filterText = viewProvider.getFilterText().trim();
        if (!filterText) {
            vscode.window.showInformationMessage('No filter is active.');
            return;
        }
        const visibleCount = viewProvider.getVisibleCount();
        const totalCount = viewProvider.getTotalCount();
        vscode.window.showInformationMessage(
            `Filter: "${filterText}" (${visibleCount}/${totalCount} files)`,
            'Clear Filter'
        ).then((selection) => {
            if (selection === 'Clear Filter') {
                viewProvider.setFilterText('');
            }
        });
    });

    scheduleRefresh();
    updateActiveMarkdown(vscode.window.activeTextEditor);

    context.subscriptions.push(
        treeView,
        previewCommand,
        exportCommand,
        markdownWatcher,
        workspaceFolderWatcher,
        activeEditorWatcher,
        treeCollapseWatcher,
        treeExpandWatcher,
        indexingStatusBar,
        refreshCommand,
        searchCommand,
        showFilterInfoCommand
    );
}

export function deactivate() {}