import * as vscode from 'vscode';

export type ActionSourceType = 'code-block' | 'comment' | 'section';

export interface MarkdownAction {
    id: string;
    title: string;
    command: string;
    source: ActionSourceType;
    language?: string;
    file: vscode.Uri;
    line: number;
    contextComments?: string;
}

export interface ActionScanResult {
    actions: MarkdownAction[];
    sources: Set<ActionSourceType>;
}

const actionCodeLanguages = new Set([
    'sh',
    'bash',
    'zsh',
    'fish',
    'shell',
    'console',
    'terminal',
    'powershell',
    'ps1',
    'pwsh',
    'cmd',
    'bat',
    'batch'
]);

const actionInfoHints = ['action', 'run'];

export function scanMarkdownActions(text: string, file: vscode.Uri): ActionScanResult {
    const actions: MarkdownAction[] = [];
    const sources = new Set<ActionSourceType>();

    collectCodeBlockActions(text, file, actions, sources);
    collectActionCommentCommands(text, file, actions, sources);
    collectActionSectionCommands(text, file, actions, sources);

    actions.sort((a, b) => a.line - b.line);
    return { actions, sources };
}

function collectCodeBlockActions(
    text: string,
    file: vscode.Uri,
    actions: MarkdownAction[],
    sources: Set<ActionSourceType>
): void {
    const fenceRegex = /```([^\n`]*)\n([\s\S]*?)```/g;
    let match: RegExpExecArray | null;
    while ((match = fenceRegex.exec(text)) !== null) {
        const info = match[1]?.trim() ?? '';
        const rawCommand = match[2]?.trim() ?? '';
        if (!rawCommand) {
            continue;
        }

        const infoLower = info.toLowerCase();
        const language = infoLower.split(/\s+/)[0] || undefined;
        const isActionLanguage = language ? actionCodeLanguages.has(language) : false;
        const hasActionHint = actionInfoHints.some((hint) => infoLower.includes(hint));
        if (!isActionLanguage && !hasActionHint) {
            continue;
        }

        const baseLineNum = getLineFromIndex(text, match.index);
        
        // Parse individual commands from the code block
        const lines = rawCommand.split(/\r?\n/);
        let precedingComments: string[] = [];
        
        for (let i = 0; i < lines.length; i += 1) {
            const trimmedLine = lines[i].trim();
            
            // Skip empty lines
            if (!trimmedLine) {
                continue;
            }
            
            // Collect comment lines
            if (trimmedLine.startsWith('#')) {
                precedingComments.push(trimmedLine.substring(1).trim());
                continue;
            }
            
            // This is a command line
            const commentContext = precedingComments.length > 0 ? precedingComments.join(' - ') : '';
            actions.push(buildAction({
                file,
                command: trimmedLine,
                source: 'code-block',
                language,
                line: baseLineNum + i,
                contextComments: commentContext
            }));
            sources.add('code-block');
            
            // Reset comments for next command
            precedingComments = [];
        }
    }
}

function collectActionCommentCommands(
    text: string,
    file: vscode.Uri,
    actions: MarkdownAction[],
    sources: Set<ActionSourceType>
): void {
    const commentRegex = /<!--\s*action\s*:\s*([\s\S]*?)\s*-->/g;
    let match: RegExpExecArray | null;
    while ((match = commentRegex.exec(text)) !== null) {
        const rawCommand = match[1]?.trim() ?? '';
        if (!rawCommand) {
            continue;
        }
        const line = getLineFromIndex(text, match.index);
        actions.push(buildAction({
            file,
            command: rawCommand,
            source: 'comment',
            line
        }));
        sources.add('comment');
    }
}

function collectActionSectionCommands(
    text: string,
    file: vscode.Uri,
    actions: MarkdownAction[],
    sources: Set<ActionSourceType>
): void {
    const lines = text.split(/\r?\n/);
    const headingRegex = /^(#{1,6})\s+Actions\s*$/i;
    for (let i = 0; i < lines.length; i += 1) {
        const headingMatch = lines[i].match(headingRegex);
        if (!headingMatch) {
            continue;
        }
        const headingLevel = headingMatch[1].length;
        for (let j = i + 1; j < lines.length; j += 1) {
            const line = lines[j];
            const nextHeadingMatch = line.match(/^(#{1,6})\s+/);
            if (nextHeadingMatch && nextHeadingMatch[1].length <= headingLevel) {
                break;
            }

            const listMatch = line.match(/^(\s*(?:[-*+]\s+|\d+\.\s+))(.*)$/);
            if (!listMatch) {
                continue;
            }

            const itemText = (listMatch[2] ?? '').trim();
            if (!itemText) {
                continue;
            }
            const backtickMatch = itemText.match(/`([^`]+)`/);
            const command = (backtickMatch ? backtickMatch[1] : itemText).trim();
            if (!command) {
                continue;
            }

            actions.push(buildAction({
                file,
                command,
                source: 'section',
                line: j + 1
            }));
            sources.add('section');
        }
    }
}

function buildAction(params: {
    file: vscode.Uri;
    command: string;
    source: ActionSourceType;
    language?: string;
    line: number;
    contextComments?: string;
}): MarkdownAction {
    const title = params.contextComments || summarizeCommand(params.command);
    return {
        id: `${params.source}:${params.line}:${hashCommand(params.command)}`,
        title,
        command: params.command,
        source: params.source,
        language: params.language,
        file: params.file,
        line: params.line,
        contextComments: params.contextComments
    };
}

function summarizeCommand(command: string): string {
    const lines = command.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const firstLine = lines[0] ?? '';
    if (firstLine.length <= 60) {
        return firstLine;
    }
    return `${firstLine.slice(0, 57)}...`;
}

function hashCommand(command: string): string {
    let hash = 0;
    for (let i = 0; i < command.length; i += 1) {
        hash = (hash * 31 + command.charCodeAt(i)) >>> 0;
    }
    return hash.toString(16);
}

function getLineFromIndex(text: string, index: number): number {
    if (index <= 0) {
        return 1;
    }
    return text.slice(0, index).split(/\r?\n/).length;
}
