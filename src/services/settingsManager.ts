import * as vscode from 'vscode';

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

function getSettingsHtml(askConfirmationBeforeAction: boolean): string {
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
    </script>
</body>
</html>`;
}
