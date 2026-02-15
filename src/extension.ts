import * as vscode from 'vscode';
import { PrettyMarkdownViewProvider } from './providers/treeViewProvider';
import { PrettyMarkdownGroupItem, PrettyMarkdownActionsGroupItem } from './types';
import { showPreview, updatePreview, getPreviewPanel } from './services/previewManager';
import { exportToPDF } from './services/pdfExporter';
import { getMarkdownLabel } from './utils/helpers';
import { MarkdownAction } from './services/actionScanner';
import {
    onDidChangeActionState,
    runMarkdownAction,
    stopMarkdownAction,
    togglePauseMarkdownAction,
    restartMarkdownAction,
    handleClosedTerminal
} from './services/actionRunner';
import { openSettingsPage } from './services/settingsManager';

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

    const pauseActionStatus = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    pauseActionStatus.text = '$(debug-pause) Action';
    pauseActionStatus.tooltip = 'Pause or resume the active action';
    pauseActionStatus.command = 'pretty-markdown.toggleActionPause';
    pauseActionStatus.hide();

    const stopActionStatus = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
    stopActionStatus.text = '$(debug-stop) Action';
    stopActionStatus.tooltip = 'Stop the active action';
    stopActionStatus.command = 'pretty-markdown.stopAction';
    stopActionStatus.hide();

    const restartActionStatus = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 98);
    restartActionStatus.text = '$(debug-restart) Action';
    restartActionStatus.tooltip = 'Restart the last action';
    restartActionStatus.command = 'pretty-markdown.restartAction';
    restartActionStatus.hide();

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
        if (event.document.languageId === 'markdown') {
            viewProvider.invalidateActions(event.document.uri);
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
        } else if (event.element instanceof PrettyMarkdownActionsGroupItem) {
            viewProvider.setActionsGroupExpanded(false);
        }
    });
    const treeExpandWatcher = treeView.onDidExpandElement(event => {
        if (event.element instanceof PrettyMarkdownGroupItem) {
            viewProvider.setGroupExpanded(true);
        } else if (event.element instanceof PrettyMarkdownActionsGroupItem) {
            viewProvider.setActionsGroupExpanded(true);
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

    const runActionCommand = vscode.commands.registerCommand('pretty-markdown.runAction', (action: MarkdownAction) => {
        if (!action) {
            vscode.window.showErrorMessage('No action was selected to run.');
            return;
        }
        const run = async () => {
            if (viewProvider.getAskConfirmationBeforeAction()) {
                const selection = await vscode.window.showWarningMessage(
                    `Run this action?\n\nTitle: ${action.title}\nCommand: ${action.command}`,
                    { modal: true },
                    'Run Action',
                    'Cancel'
                );
                if (selection !== 'Run Action') {
                    return;
                }
            }
            runMarkdownAction(action);
        };
        void run();
    });

    const toggleActionConfirmationCommand = vscode.commands.registerCommand('pretty-markdown.toggleActionConfirmation', async () => {
        openSettingsPage(context, viewProvider.getAskConfirmationBeforeAction(), (enabled: boolean) => {
            viewProvider.setAskConfirmationBeforeAction(enabled);
        });
    });

    const openSettingsCommand = vscode.commands.registerCommand('pretty-markdown.openSettings', () => {
        openSettingsPage(context, viewProvider.getAskConfirmationBeforeAction(), (enabled: boolean) => {
            viewProvider.setAskConfirmationBeforeAction(enabled);
        });
    });

    const pauseActionCommand = vscode.commands.registerCommand('pretty-markdown.toggleActionPause', () => {
        togglePauseMarkdownAction();
    });

    const stopActionCommand = vscode.commands.registerCommand('pretty-markdown.stopAction', () => {
        stopMarkdownAction();
    });

    const restartActionCommand = vscode.commands.registerCommand('pretty-markdown.restartAction', () => {
        restartMarkdownAction();
    });

    const terminalCloseWatcher = vscode.window.onDidCloseTerminal(handleClosedTerminal);

    const actionStateWatcher = onDidChangeActionState((state) => {
        void vscode.commands.executeCommand('setContext', 'prettyMarkdownActionRunning', state.isRunning);
        void vscode.commands.executeCommand('setContext', 'prettyMarkdownActionHasLast', !!state.lastAction);

        if (state.isRunning) {
            pauseActionStatus.text = state.isPaused ? '$(debug-continue) Action' : '$(debug-pause) Action';
            pauseActionStatus.show();
            stopActionStatus.show();
            restartActionStatus.show();
            return;
        }

        pauseActionStatus.hide();
        stopActionStatus.hide();
        if (state.lastAction) {
            restartActionStatus.show();
        } else {
            restartActionStatus.hide();
        }
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
        showFilterInfoCommand,
        runActionCommand,
        toggleActionConfirmationCommand,
        openSettingsCommand,
        pauseActionCommand,
        stopActionCommand,
        restartActionCommand,
        terminalCloseWatcher,
        actionStateWatcher,
        pauseActionStatus,
        stopActionStatus,
        restartActionStatus
    );
}

export function deactivate() {}