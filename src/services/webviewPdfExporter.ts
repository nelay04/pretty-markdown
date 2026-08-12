import * as vscode from 'vscode';

/**
 * PDF export that needs no browser download: the page is rendered in a webview
 * and converted with html2pdf.js, the same library the web build uses.
 *
 * html2pdf rasterises the page, so the result has no selectable text and is
 * larger than a Chrome export. It exists as a fallback for machines where
 * Chrome cannot run at all.
 */

const conversionTimeoutMs = 120000;

function getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

/**
 * Inject the converter into the already-styled preview document, so the
 * fallback produces the same layout the Chrome path does.
 */
export function buildConversionDocument(fullHtml: string, scriptUri: vscode.Uri, nonce: string, cspSource: string): string {
    const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; ` +
        `img-src ${cspSource} data: https: http:; style-src 'unsafe-inline' ${cspSource}; ` +
        `font-src ${cspSource} data:; script-src 'nonce-${nonce}';">`;

    const scripts = `
    <script nonce="${nonce}" src="${scriptUri}"></script>
    <script nonce="${nonce}">
        (function () {
            const vscodeApi = acquireVsCodeApi();

            function fail(reason) {
                vscodeApi.postMessage({ type: 'pdf-error', reason: String(reason) });
            }

            window.addEventListener('error', (event) => fail(event.message));

            window.addEventListener('load', () => {
                if (typeof html2pdf === 'undefined') {
                    fail('html2pdf failed to load');
                    return;
                }

                html2pdf().set({
                    margin: [10, 10, 10, 10],
                    image: { type: 'jpeg', quality: 0.98 },
                    html2canvas: { scale: 2, useCORS: true, logging: false },
                    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
                    pagebreak: { mode: ['css', 'legacy'] }
                })
                    .from(document.body)
                    .outputPdf('datauristring')
                    .then((dataUri) => {
                        vscodeApi.postMessage({ type: 'pdf-ready', data: String(dataUri).split(',')[1] });
                    })
                    .catch(fail);
            });
        })();
    </script>`;

    const withCsp = fullHtml.includes('<head>')
        ? fullHtml.replace('<head>', `<head>\n    ${csp}`)
        : fullHtml;

    return withCsp.includes('</body>')
        ? withCsp.replace('</body>', `${scripts}\n</body>`)
        : withCsp + scripts;
}

/**
 * Render `fullHtml` to a PDF at `targetUri` without launching a browser.
 */
export async function exportPdfWithWebview(
    context: vscode.ExtensionContext,
    fullHtml: string,
    targetUri: vscode.Uri
): Promise<void> {
    const panel = vscode.window.createWebviewPanel(
        'prettyMarkdownPdfExport',
        'Generating PDF...',
        { viewColumn: vscode.ViewColumn.Active, preserveFocus: true },
        {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')]
        }
    );

    try {
        const scriptUri = panel.webview.asWebviewUri(
            vscode.Uri.joinPath(context.extensionUri, 'media', 'vendor', 'html2pdf.bundle.min.js')
        );
        const nonce = getNonce();

        const base64 = await new Promise<string>((resolve, reject) => {
            const timeout = setTimeout(
                () => reject(new Error('Timed out while generating the PDF.')),
                conversionTimeoutMs
            );

            const messageSubscription = panel.webview.onDidReceiveMessage((message) => {
                if (!message) {
                    return;
                }
                if (message.type === 'pdf-ready' && message.data) {
                    clearTimeout(timeout);
                    resolve(message.data);
                } else if (message.type === 'pdf-error') {
                    clearTimeout(timeout);
                    reject(new Error(message.reason || 'PDF generation failed.'));
                }
            });

            const disposeSubscription = panel.onDidDispose(() => {
                clearTimeout(timeout);
                reject(new Error('PDF generation was cancelled.'));
            });

            context.subscriptions.push(messageSubscription, disposeSubscription);
            panel.webview.html = buildConversionDocument(fullHtml, scriptUri, nonce, panel.webview.cspSource);
        });

        await vscode.workspace.fs.writeFile(targetUri, Buffer.from(base64, 'base64'));
    } finally {
        panel.dispose();
    }
}
