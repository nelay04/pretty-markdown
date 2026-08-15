import * as vscode from 'vscode';
import { getMermaidBootScript, getMermaidCleanupScript, mermaidReadyFlag } from '../utils/mermaid';
import { getPrintExpandScript, getPrintFitScript, OversizedBlockPolicy } from '../utils/printLayout';
import { ThemeTokens, getMermaidThemeVariables } from './themeManager';
import { ExportTimeouts, defaultExportTimeouts } from './exportSettings';

/**
 * PDF export that needs no browser download: the page is rendered in a webview
 * and converted with html2pdf.js, the same library the web build uses.
 *
 * html2pdf rasterises the page, so the result has no selectable text and is
 * larger than a Chrome export. It exists as a fallback for machines where
 * Chrome cannot run at all.
 */

/** Page margins, in millimetres, of the A4 pages html2pdf produces. */
const pageMarginSideMm = 5;
const pageMarginBlockMm = 10;

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
export function buildConversionDocument(
    fullHtml: string,
    scriptUri: vscode.Uri,
    nonce: string,
    cspSource: string,
    mermaidUri?: vscode.Uri,
    theme?: ThemeTokens,
    policy: OversizedBlockPolicy = 'fit',
    katexUri?: vscode.Uri,
    diagramTimeoutMs: number = defaultExportTimeouts.diagramMs
): string {
    const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; ` +
        `img-src ${cspSource} data: https: http:; style-src 'unsafe-inline' ${cspSource}; ` +
        `font-src ${cspSource} data:; script-src 'nonce-${nonce}';">`;

    const scripts = `
    ${mermaidUri ? `<script nonce="${nonce}" src="${mermaidUri}"></script>` : ''}
    <script nonce="${nonce}" src="${scriptUri}"></script>
    <script nonce="${nonce}">
        (function () {
            const vscodeApi = acquireVsCodeApi();

            function fail(reason) {
                vscodeApi.postMessage({ type: 'pdf-error', reason: String(reason) });
            }

            function stage(name) {
                vscodeApi.postMessage({ type: 'pdf-stage', stage: name });
            }

            window.addEventListener('error', (event) => fail(event.message));

            // Diagrams have to finish drawing before the page is rasterised.
            function whenDiagramsReady() {
                ${mermaidUri ? 'stage(\'Drawing diagrams...\');' : ''}
                ${mermaidUri ? getMermaidBootScript(theme ? { variables: getMermaidThemeVariables(theme) } : {}) : `window.${mermaidReadyFlag} = true;`}

                return new Promise((resolve) => {
                    const deadline = ${diagramTimeoutMs > 0 ? `Date.now() + ${diagramTimeoutMs}` : 'Infinity'};
                    const poll = () => {
                        if (window.${mermaidReadyFlag} === true || Date.now() > deadline) {
                            resolve();
                            return;
                        }
                        setTimeout(poll, 100);
                    };
                    poll();
                });
            }

            window.addEventListener('load', () => {
                if (typeof html2pdf === 'undefined') {
                    fail('html2pdf failed to load');
                    return;
                }

                whenDiagramsReady().then(() => {
                ${getMermaidCleanupScript()}

                stage('Laying out pages...');

                // A section left collapsed would print as its summary alone.
                ${getPrintExpandScript()}

                // Blocks taller than a page would each cost a page-sized gap.
                ${getPrintFitScript({ marginSideMm: pageMarginSideMm, marginBlockMm: pageMarginBlockMm, policy })}

                stage('Rasterising the document...');

                html2pdf().set({
                    // html2pdf takes margins as [top, left, bottom, right].
                    // Kept as real page margins: this converter paginates by
                    // slicing one tall image, and moving the margins into the
                    // layout instead put the slice boundaries out of step with
                    // the page height, cutting and repeating content.
                    margin: [${pageMarginBlockMm}, ${pageMarginSideMm}, ${pageMarginBlockMm}, ${pageMarginSideMm}],
                    image: { type: 'jpeg', quality: 0.98 },
                    html2canvas: {
                        scale: 2,
                        useCORS: true,
                        logging: false,
                        backgroundColor: ${JSON.stringify(theme ? theme.background : '#ffffff')},
                        // html2canvas rasterises a clone of the page, and a
                        // cloned script executes again inside it. Keep scripts
                        // and mermaid's leftovers out of the copy entirely.
                        ignoreElements: (element) => element.tagName === 'SCRIPT',
                        onclone: (clonedDocument) => {
                            clonedDocument.querySelectorAll(
                                'script, .mermaidTooltip, [id^="dpretty-mermaid-"], svg[aria-roledescription="error"]'
                            ).forEach((node) => node.remove());
                        }
                    },
                    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
                    pagebreak: { mode: ['css', 'legacy'] }
                })
                    .from(document.body)
                    .outputPdf('datauristring')
                    .then((dataUri) => {
                        vscodeApi.postMessage({ type: 'pdf-ready', data: String(dataUri).split(',')[1] });
                    })
                    .catch(fail);
                }).catch(fail);
            });
        })();
    </script>`;

    // Unlike the Chrome export, this page can load the vendored stylesheet, so
    // it is linked rather than inlined with its fonts.
    const headTags = katexUri
        ? `${csp}\n    <link rel="stylesheet" href="${katexUri}">`
        : csp;

    const withCsp = fullHtml.includes('<head>')
        ? fullHtml.replace('<head>', `<head>\n    ${headTags}`)
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
    targetUri: vscode.Uri,
    theme?: ThemeTokens,
    policy: OversizedBlockPolicy = 'fit',
    timeouts: ExportTimeouts = defaultExportTimeouts,
    onStage?: (stage: string) => void
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
        const mermaidUri = fullHtml.includes('<pre class="mermaid">')
            ? panel.webview.asWebviewUri(
                vscode.Uri.joinPath(context.extensionUri, 'media', 'vendor', 'mermaid.min.js')
            )
            : undefined;
        const katexUri = fullHtml.includes('class="katex')
            ? panel.webview.asWebviewUri(
                vscode.Uri.joinPath(context.extensionUri, 'media', 'vendor', 'katex', 'katex.min.css')
            )
            : undefined;
        const nonce = getNonce();

        const base64 = await new Promise<string>((resolve, reject) => {
            // A budget of zero is the user asking for no limit at all; the
            // panel closing still ends the wait.
            const timeout = timeouts.documentMs > 0
                ? setTimeout(() => reject(new Error('Timed out while generating the PDF.')), timeouts.documentMs)
                : undefined;

            const messageSubscription = panel.webview.onDidReceiveMessage((message) => {
                if (!message) {
                    return;
                }
                if (message.type === 'pdf-stage' && typeof message.stage === 'string') {
                    // Rasterising a long document takes a while and looks
                    // hung without this.
                    onStage?.(message.stage);
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
            panel.webview.html = buildConversionDocument(
                fullHtml, scriptUri, nonce, panel.webview.cspSource, mermaidUri, theme, policy, katexUri,
                timeouts.diagramMs
            );
        });

        await vscode.workspace.fs.writeFile(targetUri, Buffer.from(base64, 'base64'));
    } finally {
        panel.dispose();
    }
}
