import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import MarkdownIt from 'markdown-it';
import puppeteer from 'puppeteer-core';
import { Browser, detectBrowserPlatform, resolveBuildId, install, computeExecutablePath } from '@puppeteer/browsers';
import hljs from 'highlight.js';

let previewPanel: vscode.WebviewPanel | undefined;

type PrettyMarkdownNode = PrettyMarkdownGroupItem | PrettyMarkdownFileItem;

class PrettyMarkdownViewProvider implements vscode.TreeDataProvider<PrettyMarkdownNode> {
    private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<PrettyMarkdownNode | undefined>();
    readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;
    private markdownFiles: vscode.Uri[] = [];
    private activeMarkdownPath: string | undefined;
    private groupExpanded = true;
    private markdownCount = 0;

    constructor() {}

    refresh(): void {
        this.onDidChangeTreeDataEmitter.fire(undefined);
    }

    setFiles(files: vscode.Uri[]): void {
        this.markdownFiles = files;
        this.markdownCount = files.length;
        this.refresh();
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
            const nodes: PrettyMarkdownNode[] = [
                new PrettyMarkdownGroupItem(this.groupExpanded, this.markdownCount)
            ];

            if (!this.groupExpanded) {
                const activeUri = this.getActiveUri();
                if (activeUri) {
                    nodes.push(new PrettyMarkdownFileItem(activeUri, getMarkdownLabel(activeUri), true));
                }
            }

            return nodes;
        }

        if (element instanceof PrettyMarkdownGroupItem) {
            return this.markdownFiles.map((uri) => {
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
}

class PrettyMarkdownGroupItem extends vscode.TreeItem {
    constructor(isExpanded: boolean, count: number) {
        super('Markdown Files', isExpanded ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed);
        this.id = 'prettyMarkdownGroup';
        this.iconPath = new vscode.ThemeIcon('list-unordered');
        this.contextValue = 'prettyMarkdownGroup';
        this.description = getCountDescription(count);
    }
}

function getCountDescription(count: number): string | undefined {
    if (count <= 0) {
        return '0 files';
    }
    return `${count} file${count === 1 ? '' : 's'}`;
}

class PrettyMarkdownFileItem extends vscode.TreeItem {
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

function getMarkdownLabel(uri: vscode.Uri): string {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
    if (workspaceFolder) {
        return vscode.workspace.asRelativePath(uri, false);
    }
    return path.basename(uri.fsPath);
}

export function activate(context: vscode.ExtensionContext) {
    console.log('Pretty Markdown extension is now active!');

    const viewProvider = new PrettyMarkdownViewProvider();
    const treeView = vscode.window.createTreeView('prettyMarkdownView', {
        treeDataProvider: viewProvider,
        showCollapseAll: false
    });

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
        if (previewPanel && event.document.languageId === 'markdown') {
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
        refreshCommand
    );
}

function showPreview(document: vscode.TextDocument, context: vscode.ExtensionContext) {
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

function updatePreview(document: vscode.TextDocument, context: vscode.ExtensionContext) {
    if (!previewPanel) {
        return;
    }

    const html = renderMarkdown(document.getText());
    previewPanel.webview.html = getWebviewContent(html, 'Preview');
}

function escapeHtml(text: string): string {
    const map: { [key: string]: string } = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
}

function renderMarkdown(markdown: string): string {
    const md = new MarkdownIt({
        html: true,
        linkify: true,
        typographer: true,
        highlight: (str: string, lang: string) => {
            if (lang && hljs.getLanguage(lang)) {
                try {
                    return `<pre class="hljs"><code>${hljs.highlight(str, { language: lang }).value}</code></pre>`;
                } catch (e) {
                    console.error(e);
                }
            }
            return `<pre class="hljs"><code>${escapeHtml(str)}</code></pre>`;
        }
    });

    return md.render(markdown);
}

async function getChromeExecutablePath(
    context: vscode.ExtensionContext,
    progress: vscode.Progress<{ message?: string; increment?: number }>
): Promise<string> {
    const cacheDir = path.join(context.globalStorageUri.fsPath, 'puppeteer');
    fs.mkdirSync(cacheDir, { recursive: true });

    const platform = detectBrowserPlatform();
    if (!platform) {
        throw new Error('Unsupported platform for Chrome download.');
    }

    const buildId = await resolveBuildId(Browser.CHROME, platform, 'stable');
    const executablePath = computeExecutablePath({
        browser: Browser.CHROME,
        buildId,
        cacheDir,
        platform
    });

    if (!fs.existsSync(executablePath)) {
        progress.report({ increment: 10, message: "Downloading browser (first time only)..." });
        await install({ browser: Browser.CHROME, buildId, cacheDir, platform });
    }

    return executablePath;
}

function getWebviewContent(content: string, title: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        /* Pretty Markdown Color Palette */
        :root {
            --pretty-black: #000000;
            --pretty-dark-blue: #0000AA;
            --pretty-dark-green: #007c2b;
            --pretty-dark-cyan: #00AAAA;
            --pretty-dark-red: #AA0000;
            --pretty-dark-magenta: #AA00AA;
            --pretty-brown: #AA5500;
            --pretty-light-gray: #AAAAAA;
            --pretty-dark-gray: #555555;
            --pretty-blue: #5555FF;
            --pretty-green: #569cd6;
            --pretty-cyan: #ce9178;
            --pretty-red: #FF5555;
            --pretty-magenta: #ff3dff;
            --pretty-yellow: #f19130;
            --pretty-white: #FFFFFF;
        }
        
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
            line-height: 1.5;
            color: #1a1a1a;
            background: #ffffff;
            padding: 20px;
            max-width: 800px;
            margin: 0 auto;
            font-size: 14px;
        }
        
        /* Headings - Monochromatic */
        h1, h2,h3,h4,h5,h6 {
            margin: 16px 0 8px;
            font-weight: 500;
            line-height: 1.3;
            color: #000000;
        }
        
        h1 {
            font-size: 1.75em;
            border-bottom: 1px solid #cccccc;
            padding-bottom: 6px;
            margin-bottom: 16px;
        }
        
        h2 {
            font-size: 1.5em;
        }
        
        h3 { 
            font-size: 1.25em;
        }
        
        h4 { 
            font-size: 1.1em;
        }
        
        h5, h6 {
            font-size: 1em;
        }
        
        /* Text elements */
        p {
            margin: 8px 0;
            text-align: left;
        }
        
        a {
            color: #333333;
            text-decoration: none;
            border-bottom: 1px solid #999999;
        }
        
        a:hover {
            color: #000000;
            border-bottom: 1px solid #333333;
        }
        
        /* Inline code */
        code {
            background: #f5f7f9;
            padding: 2px 4px;
            border-radius: 2px;
            font-family: 'Consolas', 'Courier New', monospace;
            font-size: 0.85em;
            color: var(--pretty-dark-red);
        }
        
        /* Code blocks */
        pre {
            background: #f5f7f9;
            color: #1a1a1a;
            padding: 12px;
            border-radius: 3px;
            overflow-x: auto;
            margin: 12px 0;
            border: 1px solid #d0d8e0;
            font-size: 0.85em;
            line-height: 1.4;
        }
        
        pre code {
            background: transparent;
            padding: 0;
            color: inherit;
            border: none;
        }
        
        /* Syntax highlighting with Pretty Markdown colors */
        .hljs-keyword { color: var(--pretty-yellow); }
        .hljs-string { color: var(--pretty-green); }
        .hljs-comment { color: var(--pretty-dark-gray); }
        .hljs-number { color: var(--pretty-cyan); }
        .hljs-built_in { color: var(--pretty-magenta); }
        .hljs-variable { color: var(--pretty-blue); }
        .hljs-title { color: var(--pretty-red); }
        .hljs-attr { color: var(--pretty-dark-cyan); }
        .hljs-selector-tag { color: var(--pretty-yellow); }
        .hljs-selector-id { color: var(--pretty-green); }
        .hljs-selector-class { color: var(--pretty-cyan); }
        .hljs-literal { color: var(--pretty-magenta); }
        .hljs-function { color: var(--pretty-blue); }
        .hljs-punctuation { color: var(--pretty-light-gray); }
        
        /* Blockquotes */
        blockquote {
            border-left: 3px solid #666666;
            padding-left: 12px;
            margin: 12px 0;
            color: #555555;
            font-style: italic;
            background: #f9f9f9;
            padding: 8px 12px;
        }
        
        /* Lists */
        ul, ol {
            margin: 8px 0;
            padding-left: 20px;
        }
        
        li {
            margin: 4px 0;
        }
        
        /* Tables */
        table {
            border-collapse: collapse;
            width: 100%;
            margin: 12px 0;
            background: #ffffff;
            border: 1px solid #cccccc;
            font-size: 0.9em;
        }
        
        th, td {
            border: 1px solid #cccccc;
            padding: 6px 8px;
            text-align: left;
        }
        
        th {
            background: #f5f5f5;
            font-weight: 500;
            color: #000000;
        }
        
        tr:nth-child(even) {
            background: #fafafa;
        }
        
        /* Images */
        img {
            max-width: 100%;
            height: auto;
            margin: 12px 0;
        }
        
        /* Horizontal rule */
        hr {
            border: none;
            border-top: 1px solid #cccccc;
            margin: 16px 0;
        }
        
        /* Compact spacing adjustments */
        h1 + p, h2 + p, h3 + p, h4 + p, h5 + p, h6 + p {
            margin-top: 4px;
        }
        
        /* Print styles for clean PDF export */
        @media print {
            body {
                padding: 5mm;
                font-size: 11pt;
                line-height: 1.4;
            }
            
            h1, h2, h3, h4, h5, h6 {
                margin: 12pt 0 6pt;
                page-break-after: avoid;
            }
            
            p, li {
                margin: 4pt 0;
            }
            
            pre {
                page-break-inside: avoid;
                font-size: 9pt;
            }
        }
    </style>
</head>
<body>
    ${content}
</body>
</html>`;
}

async function exportToPDF(document: vscode.TextDocument, context: vscode.ExtensionContext) {
    const html = renderMarkdown(document.getText());
    const fullHtml = getWebviewContent(html, path.basename(document.fileName));

    vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Exporting to PDF...",
        cancellable: false
    }, async (progress) => {
        try {
            progress.report({ increment: 10, message: "Preparing browser..." });

            const executablePath = await getChromeExecutablePath(context, progress);
            const browser = await puppeteer.launch({
                executablePath,
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
            });

            progress.report({ increment: 30, message: "Rendering document..." });

            const page = await browser.newPage();
            await page.setContent(fullHtml, { waitUntil: 'networkidle0' });

            progress.report({ increment: 30, message: "Generating PDF..." });

            const defaultPath = document.fileName.replace(/\.md$/, '.pdf');
            const pdfPath = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file(defaultPath),
                filters: { 'PDF': ['pdf'] }
            });

            if (pdfPath) {
                await page.pdf({
                    path: pdfPath.fsPath,
                    format: 'A4',
                    margin: {
                        top: '10mm',
                        right: '10mm',
                        bottom: '10mm',
                        left: '10mm'
                    },
                    printBackground: true
                });

                progress.report({ increment: 20, message: "Done!" });

                await browser.close();

                vscode.window.showInformationMessage(`PDF exported successfully to ${path.basename(pdfPath.fsPath)}`);
            } else {
                await browser.close();
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to export PDF: ${error}`);
        }
    });
}

export function deactivate() {}