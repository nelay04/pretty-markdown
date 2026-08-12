import * as vscode from 'vscode';
import { resolveTheme, getThemeTokens, themeTokenNames, isValidColor, ThemeName, ThemeTokens } from './themeManager';

/** Labels for the palette editor, in the order they are shown. */
const tokenLabels: { [token: string]: string } = {
    background: 'Page background',
    text: 'Body text',
    heading: 'Headings',
    headingRule: 'Heading rule',
    link: 'Links',
    linkHover: 'Links (hover)',
    inlineCodeBackground: 'Inline code background',
    inlineCodeText: 'Inline code text',
    codeBackground: 'Code block background',
    codeText: 'Code block text',
    codeBorder: 'Code block border',
    blockquoteBackground: 'Blockquote background',
    blockquoteBorder: 'Blockquote border',
    blockquoteText: 'Blockquote text',
    tableBackground: 'Table background',
    tableHeaderBackground: 'Table header',
    tableRowAlternate: 'Table alternate row',
    tableBorder: 'Table border',
    horizontalRule: 'Horizontal rule',
    diagramBackground: 'Diagram background',
    syntaxKeyword: 'Syntax: keyword',
    syntaxString: 'Syntax: string',
    syntaxComment: 'Syntax: comment',
    syntaxNumber: 'Syntax: number',
    syntaxBuiltIn: 'Syntax: built-in',
    syntaxVariable: 'Syntax: variable',
    syntaxTitle: 'Syntax: title',
    syntaxAttribute: 'Syntax: attribute',
    syntaxLiteral: 'Syntax: literal',
    syntaxFunction: 'Syntax: function',
    syntaxPunctuation: 'Syntax: punctuation'
};

/**
 * Colour edits are written to settings, which is what every render target
 * reads, so the preview and PDF exports both follow along.
 */
async function applyThemeName(name: ThemeName): Promise<void> {
    await vscode.workspace.getConfiguration('prettyMarkdown').update('theme', name, vscode.ConfigurationTarget.Global);
}

async function applyColorOverride(token: string, value: string | undefined): Promise<void> {
    const configuration = vscode.workspace.getConfiguration('prettyMarkdown');
    const colors = { ...(configuration.get<{ [key: string]: string }>('colors', {}) || {}) };

    if (value && isValidColor(value)) {
        colors[token] = value;
    } else {
        delete colors[token];
    }

    await configuration.update('colors', colors, vscode.ConfigurationTarget.Global);
}

async function resetColors(): Promise<void> {
    await vscode.workspace.getConfiguration('prettyMarkdown').update('colors', {}, vscode.ConfigurationTarget.Global);
}

let settingsPanel: vscode.WebviewPanel | undefined;

export function openSettingsPage(context: vscode.ExtensionContext, askConfirmationBeforeAction: boolean, onToggle: (enabled: boolean) => void): void {
    if (settingsPanel) {
        settingsPanel.reveal(vscode.ViewColumn.One);
        return;
    }

    settingsPanel = vscode.window.createWebviewPanel(
        'prettyMarkdownSettings',
        'Pretty Markdown Settings',
        vscode.ViewColumn.One,
        {
            enableScripts: true,
            retainContextWhenHidden: true
        }
    );

    settingsPanel.webview.html = getSettingsHtml(askConfirmationBeforeAction);

    settingsPanel.webview.onDidReceiveMessage(
        message => {
            switch (message.command) {
                case 'toggleConfirmation':
                    handleToggleConfirmation(message.enabled, onToggle);
                    break;
                case 'setTheme':
                    applyThemeName(message.theme).then(refreshSettingsPanel);
                    break;
                case 'setColor':
                    applyColorOverride(message.token, message.value).then(refreshSettingsPanel);
                    break;
                case 'resetColors':
                    resetColors().then(refreshSettingsPanel);
                    break;
            }
        },
        undefined,
        context.subscriptions
    );

    settingsPanel.onDidDispose(
        () => {
            settingsPanel = undefined;
        },
        null,
        context.subscriptions
    );
}

async function handleToggleConfirmation(enabled: boolean, onToggle: (enabled: boolean) => void): Promise<void> {
    if (!enabled) {
        const selection = await vscode.window.showWarningMessage(
            'Pretty Markdown recommends keeping "Ask confirmation before action" enabled because actions may run destructive commands accidentally.',
            { modal: true },
            'Turn Off',
            'Keep On'
        );
        if (selection !== 'Turn Off') {
            // User cancelled, refresh the webview to restore checkbox state
            if (settingsPanel) {
                settingsPanel.webview.html = getSettingsHtml(true);
            }
            return;
        }
    }
    
    onToggle(enabled);
    
    // Update the webview to reflect the new state
    if (settingsPanel) {
        settingsPanel.webview.html = getSettingsHtml(enabled);
    }
}

let currentConfirmationState = true;

function refreshSettingsPanel(): void {
    if (settingsPanel) {
        settingsPanel.webview.html = getSettingsHtml(currentConfirmationState);
    }
}

function getPaletteSectionHtml(): string {
    const configuration = vscode.workspace.getConfiguration('prettyMarkdown');
    const themeName = configuration.get<ThemeName>('theme', 'default');
    const overrides = configuration.get<{ [key: string]: string }>('colors', {}) || {};
    const resolved: ThemeTokens = resolveTheme();
    const presetValues = getThemeTokens(themeName);

    const themeOptions = (['default', 'github', 'dark', 'sepia'] as ThemeName[])
        .map(name => `<option value="${name}" ${name === themeName ? 'selected' : ''}>${name}</option>`)
        .join('');

    const swatches = themeTokenNames.map(token => {
        const value = resolved[token];
        const overridden = Object.prototype.hasOwnProperty.call(overrides, token);
        return `
            <div class="color-row">
                <input type="color" class="color-input" data-token="${token}" value="${toHexInputValue(value, presetValues[token])}" />
                <label class="color-label" for="${token}">${tokenLabels[token] || token}</label>
                <input type="text" class="color-text" data-token="${token}" value="${value}" spellcheck="false" />
                ${overridden ? `<button class="reset-one" data-token="${token}" title="Back to theme colour">reset</button>` : '<span class="reset-spacer"></span>'}
            </div>`;
    }).join('');

    return `
        <div class="settings-section">
            <div class="section-title">Theme and colours</div>
            <div class="setting-description" style="margin-bottom:16px;">
                Applies to the preview and to exported PDFs. Pick a theme, then override
                any individual component. Changes are saved to your user settings.
            </div>

            <div class="theme-row">
                <label class="setting-label" for="themeSelect">Theme</label>
                <select id="themeSelect" class="theme-select">${themeOptions}</select>
                <button id="resetColors" class="reset-all">Reset all overrides</button>
            </div>

            <div class="color-grid">${swatches}</div>
        </div>`;
}

/** <input type="color"> only accepts #rrggbb, so anything else shows the preset. */
function toHexInputValue(value: string, fallback: string): string {
    const candidate = /^#[0-9a-f]{6}$/i.test(value.trim()) ? value.trim() : fallback.trim();
    return /^#[0-9a-f]{6}$/i.test(candidate) ? candidate : '#000000';
}

function getSettingsHtml(askConfirmationBeforeAction: boolean): string {
    currentConfirmationState = askConfirmationBeforeAction;
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Pretty Markdown Settings</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            padding: 20px;
            color: var(--vscode-foreground);
        }
        
        .settings-container {
            max-width: 800px;
        }
        
        .settings-header {
            font-size: 24px;
            font-weight: 600;
            margin-bottom: 8px;
            color: var(--vscode-foreground);
        }
        
        .settings-description {
            font-size: 13px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 30px;
        }
        
        .settings-section {
            margin-bottom: 30px;
        }
        
        .section-title {
            font-size: 16px;
            font-weight: 600;
            margin-bottom: 16px;
            color: var(--vscode-foreground);
        }
        
        .setting-item {
            display: flex;
            align-items: flex-start;
            padding: 16px 0;
            border-bottom: 1px solid var(--vscode-widget-border);
        }
        
        .setting-item:last-child {
            border-bottom: none;
        }
        
        .setting-control {
            margin-right: 12px;
            margin-top: 2px;
        }
        
        .setting-info {
            flex: 1;
        }
        
        .setting-label {
            font-size: 13px;
            font-weight: 500;
            margin-bottom: 4px;
            color: var(--vscode-foreground);
        }
        
        .setting-description {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            line-height: 1.5;
        }
        
        .checkbox {
            width: 16px;
            height: 16px;
            cursor: pointer;
            accent-color: var(--vscode-checkbox-foreground, var(--vscode-foreground));
        }
        
        .warning-badge {
            display: inline-block;
            background: transparent;
            color: var(--vscode-descriptionForeground);
            border: 1px solid var(--vscode-descriptionForeground);
            padding: 2px 8px;
            border-radius: 2px;
            font-size: 11px;
            font-weight: 600;
            margin-left: 8px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .theme-row {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 20px;
        }

        .theme-select {
            background: var(--vscode-dropdown-background);
            color: var(--vscode-dropdown-foreground);
            border: 1px solid var(--vscode-dropdown-border);
            padding: 4px 8px;
            border-radius: 2px;
            text-transform: capitalize;
        }

        .reset-all, .reset-one {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: none;
            padding: 4px 10px;
            border-radius: 2px;
            cursor: pointer;
            font-size: 12px;
        }

        .reset-all:hover, .reset-one:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }

        .color-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
            gap: 6px 24px;
        }

        .color-row {
            display: grid;
            grid-template-columns: 28px 1fr 110px 56px;
            align-items: center;
            gap: 8px;
            padding: 4px 0;
        }

        .color-input {
            width: 26px;
            height: 22px;
            padding: 0;
            border: 1px solid var(--vscode-widget-border);
            background: none;
            cursor: pointer;
        }

        .color-label {
            font-size: 13px;
            color: var(--vscode-foreground);
        }

        .color-text {
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border, transparent);
            padding: 3px 6px;
            border-radius: 2px;
            font-family: var(--vscode-editor-font-family);
            font-size: 12px;
            width: 100%;
        }

        .color-text.invalid {
            border-color: var(--vscode-inputValidation-errorBorder, #be1100);
        }

        .reset-spacer {
            display: inline-block;
        }
    </style>
</head>
<body>
    <div class="settings-container">
        <div class="settings-header">Pretty Markdown Settings</div>
        <div class="settings-description">Configure how Pretty Markdown handles actions and commands.</div>
        
        <div class="settings-section">
            <div class="section-title">Action Execution</div>
            
            <div class="setting-item">
                <div class="setting-control">
                    <input 
                        type="checkbox" 
                        id="askConfirmation" 
                        class="checkbox"
                        ${askConfirmationBeforeAction ? 'checked' : ''}
                    />
                </div>
                <div class="setting-info">
                    <label for="askConfirmation" class="setting-label">
                        Ask confirmation before action
                        ${!askConfirmationBeforeAction ? '<span class="warning-badge">RECOMMENDED</span>' : ''}
                    </label>
                    <div class="setting-description">
                        When enabled, a confirmation dialog will appear before running any action. 
                        This prevents accidental execution of potentially destructive commands.
                        <strong>Pretty Markdown recommends keeping this enabled for safety.</strong>
                    </div>
                </div>
            </div>
        </div>

        ${getPaletteSectionHtml()}
    </div>
    
    <script>
        const vscode = acquireVsCodeApi();
        const checkbox = document.getElementById('askConfirmation');
        
        checkbox.addEventListener('change', (e) => {
            const requestedState = e.target.checked;
            if (!requestedState) {
                // keep the checkbox visually checked until the modal decision is resolved
                checkbox.checked = true;
            }
            vscode.postMessage({
                command: 'toggleConfirmation',
                enabled: requestedState
            });
        });

        const themeSelect = document.getElementById('themeSelect');
        themeSelect.addEventListener('change', (e) => {
            vscode.postMessage({ command: 'setTheme', theme: e.target.value });
        });

        document.getElementById('resetColors').addEventListener('click', () => {
            vscode.postMessage({ command: 'resetColors' });
        });

        document.querySelectorAll('.reset-one').forEach((button) => {
            button.addEventListener('click', () => {
                vscode.postMessage({ command: 'setColor', token: button.dataset.token, value: undefined });
            });
        });

        // The picker and the text box edit the same value; keep them in step
        // and only send a change once the user has finished with it.
        document.querySelectorAll('.color-input').forEach((picker) => {
            picker.addEventListener('change', () => {
                const text = document.querySelector('.color-text[data-token="' + picker.dataset.token + '"]');
                if (text) {
                    text.value = picker.value;
                }
                vscode.postMessage({ command: 'setColor', token: picker.dataset.token, value: picker.value });
            });
        });

        const colorPattern = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%/]+\)|hsla?\([\d\s.,%/deg]+\)|[a-z]+)$/i;
        document.querySelectorAll('.color-text').forEach((text) => {
            const commit = () => {
                const value = text.value.trim();
                if (!colorPattern.test(value)) {
                    text.classList.add('invalid');
                    return;
                }
                text.classList.remove('invalid');
                vscode.postMessage({ command: 'setColor', token: text.dataset.token, value });
            };

            text.addEventListener('blur', commit);
            text.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    commit();
                }
            });
        });
    </script>
</body>
</html>`;
}
