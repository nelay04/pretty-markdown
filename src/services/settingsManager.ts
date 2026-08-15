import * as vscode from 'vscode';
import { resolveTheme, getThemeTokens, themeTokenNames, themeLabels, isValidColor, ThemeName, ThemeTokens } from './themeManager';

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

/** Where the preview opens, matching the enum in package.json. */
const previewLocations: { [value: string]: string } = {
    beside: 'New editor group',
    active: 'Current editor group',
    replace: "Replace the file's editor"
};

async function applyPreviewLocation(value: string): Promise<void> {
    const location = Object.prototype.hasOwnProperty.call(previewLocations, value) ? value : 'beside';
    await vscode.workspace.getConfiguration('prettyMarkdown')
        .update('openPreviewIn', location, vscode.ConfigurationTarget.Global);
}

/**
 * Timeouts are seconds in settings, and zero is a deliberate "no limit" rather
 * than a value to reject.
 */
async function applyTimeout(key: string, seconds: number): Promise<void> {
    if ((key !== 'exportTimeout' && key !== 'diagramTimeout') || !Number.isFinite(seconds) || seconds < 0) {
        return;
    }

    await vscode.workspace.getConfiguration('prettyMarkdown')
        .update(key, Math.round(seconds), vscode.ConfigurationTarget.Global);
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
                case 'setPreviewLocation':
                    void applyPreviewLocation(message.value);
                    break;
                case 'setTimeout':
                    void applyTimeout(message.key, Number(message.value));
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
        .map(name => `<option value="${name}" ${name === themeName ? 'selected' : ''}>${themeLabels[name]}</option>`)
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
                ${getSelectHtml('themeSelect', themeOptions)}
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

/** The settings editor's controls are all this wide, whatever they hold. */
const controlWidthPx = 340;

/**
 * A select and the chevron the browser's own appearance would have drawn.
 * Dropping that appearance is what lets the control be themed at all, so the
 * chevron has to be supplied here, in currentColor so it follows the theme.
 */
function getSelectHtml(id: string, options: string): string {
    return `<div class="select-wrapper">
                    <select id="${id}" class="setting-select">${options}</select>
                    <span class="select-chevron"><svg viewBox="0 0 16 16" aria-hidden="true">` +
        '<path d="M3.8 5.8 8 10l4.2-4.2" fill="none" stroke="currentColor" stroke-width="1.4" ' +
        'stroke-linecap="round" stroke-linejoin="round"/></svg></span>\n                </div>';
}

/** Checkbox tick, drawn rather than loaded: a webview has no codicon font. */
const checkboxTick = '<svg viewBox="0 0 16 16" aria-hidden="true">' +
    '<path d="M14.4 3.7 6.2 12l-4.6-4.6 1.1-1.1L6.2 9.8l7.1-7.2z"/></svg>';

/**
 * One setting, laid out the way the VS Code settings editor lays one out:
 * title, description, control, and a bar down the left once the value is no
 * longer the default.
 */
function getSettingItemHtml(
    options: { title: string; description: string; control: string; value: string; defaultValue: string; badge?: string }
): string {
    const modified = options.value !== options.defaultValue ? ' modified' : '';

    return `
            <div class="setting-item${modified}" data-default="${options.defaultValue}">
                <div class="setting-title">${options.title}${options.badge || ''}</div>
                <div class="setting-description">${options.description}</div>
                ${options.control}
            </div>`;
}

function getPreviewSectionHtml(): string {
    const location = vscode.workspace.getConfiguration('prettyMarkdown').get<string>('openPreviewIn', 'beside');
    const options = Object.keys(previewLocations)
        .map(value => `<option value="${value}" ${value === location ? 'selected' : ''}>${previewLocations[value]}</option>`)
        .join('');

    return `
        <div class="settings-section">
            <div class="section-title">Preview</div>
            ${getSettingItemHtml({
                title: 'Open preview in',
                description: 'Whether the preview opens in a new editor group beside the Markdown file, ' +
                    'as a tab in the group the file is already in, or in the file\'s own place. ' +
                    'Replacing the editor closes the file; Close Preview, on the preview\'s title bar, puts it back.',
                control: getSelectHtml('previewLocation', options),
                value: location,
                defaultValue: 'beside'
            })}
        </div>`;
}

function getExportSectionHtml(): string {
    const configuration = vscode.workspace.getConfiguration('prettyMarkdown');
    const exportTimeout = String(configuration.get<number>('exportTimeout', 120));
    const diagramTimeout = String(configuration.get<number>('diagramTimeout', 20));

    const numberControl = (setting: string, value: string) =>
        `<input type="number" class="setting-number" data-setting="${setting}" min="0" step="5" value="${value}" />`;

    return `
        <div class="settings-section">
            <div class="section-title">PDF export</div>
            ${getSettingItemHtml({
                title: 'Export timeout',
                description: 'How long an export may spend laying the document out before it gives up, ' +
                    'in seconds. Raise it for a long or image-heavy document that fails with a timeout, ' +
                    'or set it to 0 to wait for as long as it takes.',
                control: numberControl('exportTimeout', exportTimeout),
                value: exportTimeout,
                defaultValue: '120'
            })}
            ${getSettingItemHtml({
                title: 'Diagram timeout',
                description: 'How long an export waits for the diagrams in a document to be drawn, ' +
                    'in seconds. A diagram that is not ready in time is printed as its source text, so ' +
                    'the export still finishes. Set it to 0 to wait for as long as it takes.',
                control: numberControl('diagramTimeout', diagramTimeout),
                value: diagramTimeout,
                defaultValue: '20'
            })}
        </div>`;
}

function getActionSectionHtml(askConfirmationBeforeAction: boolean): string {
    const control = `
                <label class="setting-checkbox">
                    <input type="checkbox" id="askConfirmation" ${askConfirmationBeforeAction ? 'checked' : ''} />
                    <span class="checkbox-box">${checkboxTick}</span>
                    <span class="checkbox-text">Ask for confirmation before running an action</span>
                </label>`;

    return `
        <div class="settings-section">
            <div class="section-title">Action execution</div>
            ${getSettingItemHtml({
                title: 'Ask confirmation before action',
                badge: !askConfirmationBeforeAction ? '<span class="warning-badge">Recommended</span>' : '',
                description: 'Actions run shell commands taken from the open document. With this on, ' +
                    'a confirmation dialog appears first, which is what stops a destructive command ' +
                    'running by accident. Pretty Markdown recommends leaving it on.',
                control,
                value: askConfirmationBeforeAction ? 'true' : 'false',
                defaultValue: 'true'
            })}
        </div>`;
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
            font-size: 13px;
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
            margin-bottom: 24px;
        }

        .settings-section {
            margin-bottom: 24px;
        }

        .section-title {
            font-size: 16px;
            font-weight: 600;
            margin-bottom: 8px;
            color: var(--vscode-settings-headerForeground, var(--vscode-foreground));
        }

        /* Laid out like a row of the VS Code settings editor: the indicator
           bar sits in the gutter the padding leaves for it. */
        .setting-item {
            position: relative;
            padding: 12px 14px;
            border-radius: 4px;
        }

        .setting-item:hover {
            background: var(--vscode-settings-rowHoverBackground, transparent);
        }

        .setting-item::before {
            content: '';
            position: absolute;
            left: 0;
            top: 10px;
            bottom: 10px;
            width: 2px;
            border-radius: 1px;
            background: transparent;
        }

        .setting-item.modified::before {
            background: var(--vscode-settings-modifiedItemIndicator, var(--vscode-focusBorder));
        }

        .setting-title {
            font-weight: 600;
            color: var(--vscode-settings-headerForeground, var(--vscode-foreground));
            margin-bottom: 4px;
        }

        .setting-label {
            font-size: 13px;
            font-weight: 500;
            color: var(--vscode-foreground);
        }

        .setting-description {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            line-height: 1.5;
            margin-bottom: 10px;
            max-width: 700px;
        }

        .setting-checkbox {
            display: flex;
            align-items: center;
            gap: 9px;
            cursor: pointer;
            width: fit-content;
        }

        /* Kept focusable and in the tab order; the box beside it is what is
           actually painted, because a native checkbox cannot be themed. */
        .setting-checkbox input {
            position: absolute;
            width: 18px;
            height: 18px;
            margin: 0;
            opacity: 0;
            cursor: pointer;
        }

        .checkbox-box {
            flex: none;
            display: flex;
            align-items: center;
            justify-content: center;
            width: 18px;
            height: 18px;
            border-radius: 3px;
            border: 1px solid var(--vscode-settings-checkboxBorder, var(--vscode-contrastBorder, transparent));
            background: var(--vscode-settings-checkboxBackground, var(--vscode-input-background));
            color: var(--vscode-settings-checkboxForeground, var(--vscode-foreground));
        }

        .checkbox-box svg {
            width: 13px;
            height: 13px;
            fill: currentColor;
            visibility: hidden;
        }

        .setting-checkbox input:checked + .checkbox-box svg {
            visibility: visible;
        }

        .setting-checkbox input:focus + .checkbox-box {
            outline: 1px solid var(--vscode-focusBorder);
            outline-offset: 2px;
        }

        .checkbox-text {
            color: var(--vscode-foreground);
        }

        .select-wrapper {
            position: relative;
            display: block;
            width: 100%;
            max-width: ${controlWidthPx}px;
            color: var(--vscode-settings-dropdownForeground, var(--vscode-dropdown-foreground));
        }

        .select-chevron {
            position: absolute;
            right: 8px;
            top: 0;
            bottom: 0;
            display: flex;
            align-items: center;
            pointer-events: none;
        }

        .select-chevron svg {
            width: 14px;
            height: 14px;
        }

        /* No appearance means no browser chrome to theme around: the chevron
           beside it is ours, and so are the option colours. */
        .setting-select {
            appearance: none;
            -webkit-appearance: none;
            width: 100%;
            background: var(--vscode-settings-dropdownBackground, var(--vscode-dropdown-background));
            color: inherit;
            border: 1px solid var(--vscode-settings-dropdownBorder, var(--vscode-dropdown-border));
            padding: 4px 28px 4px 8px;
            border-radius: 2px;
            font-family: inherit;
            font-size: 13px;
            cursor: pointer;
        }

        .setting-select option {
            background: var(--vscode-settings-dropdownListBackground, var(--vscode-dropdown-listBackground));
            color: var(--vscode-settings-dropdownForeground, var(--vscode-dropdown-foreground));
        }

        .setting-number {
            width: 100%;
            max-width: ${controlWidthPx}px;
            background: var(--vscode-settings-textInputBackground, var(--vscode-input-background));
            color: var(--vscode-settings-textInputForeground, var(--vscode-input-foreground));
            border: 1px solid var(--vscode-settings-textInputBorder, var(--vscode-input-border, transparent));
            padding: 4px 8px;
            border-radius: 2px;
            font-family: inherit;
            font-size: 13px;
        }

        /* The settings editor takes numbers in a plain text box; the spinner
           arrows are the one part of it a number input adds unasked. */
        .setting-number {
            appearance: textfield;
            -moz-appearance: textfield;
        }

        .setting-number::-webkit-outer-spin-button,
        .setting-number::-webkit-inner-spin-button {
            -webkit-appearance: none;
            margin: 0;
        }

        .setting-select:focus, .setting-number:focus, .color-text:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
        }

        .setting-number.invalid, .color-text.invalid {
            border-color: var(--vscode-inputValidation-errorBorder, #be1100);
        }

        .warning-badge {
            display: inline-block;
            background: transparent;
            color: var(--vscode-descriptionForeground);
            border: 1px solid var(--vscode-descriptionForeground);
            padding: 1px 8px;
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

        .theme-row .select-wrapper {
            max-width: 240px;
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
            background: var(--vscode-settings-textInputBackground, var(--vscode-input-background));
            color: var(--vscode-settings-textInputForeground, var(--vscode-input-foreground));
            border: 1px solid var(--vscode-settings-textInputBorder, var(--vscode-input-border, transparent));
            padding: 3px 6px;
            border-radius: 2px;
            font-family: var(--vscode-editor-font-family);
            font-size: 12px;
            width: 100%;
        }

        .reset-spacer {
            display: inline-block;
        }
    </style>
</head>
<body>
    <div class="settings-container">
        <div class="settings-header">Pretty Markdown Settings</div>
        <div class="settings-description">Everything here is written to your user settings, so the preview, PDF exports and the VS Code settings editor all stay in step.</div>

        ${getPreviewSectionHtml()}

        ${getExportSectionHtml()}

        ${getActionSectionHtml(askConfirmationBeforeAction)}

        ${getPaletteSectionHtml()}
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        // The bar down the left marks a setting that no longer holds its
        // default, as the VS Code settings editor does.
        function markModified(control, value) {
            const item = control.closest('.setting-item');
            if (item) {
                item.classList.toggle('modified', String(value) !== item.dataset.default);
            }
        }

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

        const previewLocation = document.getElementById('previewLocation');
        previewLocation.addEventListener('change', () => {
            vscode.postMessage({ command: 'setPreviewLocation', value: previewLocation.value });
            markModified(previewLocation, previewLocation.value);
        });

        document.querySelectorAll('.setting-number').forEach((input) => {
            const commit = () => {
                const seconds = Number(input.value);
                if (!Number.isFinite(seconds) || seconds < 0) {
                    input.classList.add('invalid');
                    return;
                }
                input.classList.remove('invalid');
                vscode.postMessage({
                    command: 'setTimeout',
                    key: input.dataset.setting,
                    value: Math.round(seconds)
                });
                markModified(input, Math.round(seconds));
            };

            input.addEventListener('change', commit);
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    commit();
                }
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
