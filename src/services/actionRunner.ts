import * as vscode from 'vscode';
import { MarkdownAction } from './actionScanner';

export interface ActionState {
    isRunning: boolean;
    isPaused: boolean;
    lastAction?: MarkdownAction;
    activeAction?: MarkdownAction;
    terminal?: vscode.Terminal;
}

const actionState: ActionState = {
    isRunning: false,
    isPaused: false
};

const onDidChangeActionStateEmitter = new vscode.EventEmitter<ActionState>();
export const onDidChangeActionState = onDidChangeActionStateEmitter.event;

let actionTerminal: vscode.Terminal | undefined;
let hasFocusedTerminal = false;

export function runMarkdownAction(action: MarkdownAction): void {
    const terminal = getOrCreateActionTerminal();
    const command = buildRunnerCommand(action);
    if (!command) {
        vscode.window.showErrorMessage('Selected action is empty.');
        return;
    }

    actionState.lastAction = action;
    actionState.activeAction = action;
    actionState.isRunning = true;
    actionState.isPaused = false;
    actionState.terminal = terminal;
    onDidChangeActionStateEmitter.fire({ ...actionState });

    terminal.sendText(command, true);
}

export function stopMarkdownAction(): void {
    if (!actionState.terminal || !actionState.isRunning) {
        return;
    }
    actionState.terminal.sendText('\x03', false);
    actionState.isRunning = false;
    actionState.isPaused = false;
    actionState.activeAction = undefined;
    onDidChangeActionStateEmitter.fire({ ...actionState });
}

export function togglePauseMarkdownAction(): void {
    if (!actionState.terminal || !actionState.isRunning) {
        return;
    }

    if (actionState.isPaused) {
        actionState.terminal.sendText('fg', true);
        actionState.isPaused = false;
    } else {
        actionState.terminal.sendText('\x1A', false);
        actionState.isPaused = true;
    }

    onDidChangeActionStateEmitter.fire({ ...actionState });
}

export function restartMarkdownAction(): void {
    if (!actionState.lastAction) {
        return;
    }
    runMarkdownAction(actionState.lastAction);
}

export function handleClosedTerminal(terminal: vscode.Terminal): void {
    if (actionState.terminal !== terminal) {
        return;
    }
    actionTerminal = undefined;
    actionState.terminal = undefined;
    actionState.isRunning = false;
    actionState.isPaused = false;
    actionState.activeAction = undefined;
    onDidChangeActionStateEmitter.fire({ ...actionState });
}

function getOrCreateActionTerminal(): vscode.Terminal {
    if (actionTerminal) {
        return actionTerminal;
    }
    actionTerminal = vscode.window.createTerminal({
        name: 'Pretty Markdown Actions'
    });
    if (!hasFocusedTerminal) {
        actionTerminal.show(false);
        hasFocusedTerminal = true;
    } else {
        actionTerminal.show(true);
    }
    return actionTerminal;
}

function buildRunnerCommand(action: MarkdownAction): string {
    const command = action.command.trim();
    if (!command) {
        return '';
    }

    const runner = detectRunner(action.language);
    if (runner === 'powershell') {
        return wrapPowerShell(command);
    }
    if (runner === 'cmd') {
        return wrapCmd(command);
    }
    return command;
}

function detectRunner(language?: string): 'default' | 'powershell' | 'cmd' {
    if (!language) {
        return 'default';
    }
    const normalized = language.toLowerCase();
    if (['powershell', 'ps1', 'pwsh'].includes(normalized)) {
        return 'powershell';
    }
    if (['cmd', 'bat', 'batch'].includes(normalized)) {
        return 'cmd';
    }
    return 'default';
}

function wrapPowerShell(command: string): string {
    const escaped = command.replace(/"/g, '\\"');
    if (process.platform === 'win32') {
        return `powershell -NoLogo -NoProfile -Command "${escaped}"`;
    }
    return `pwsh -NoLogo -NoProfile -Command "${escaped}"`;
}

function wrapCmd(command: string): string {
    const escaped = command.replace(/"/g, '\\"');
    return `cmd /c "${escaped}"`;
}
