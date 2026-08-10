import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import puppeteer from 'puppeteer-core';
import { Browser, detectBrowserPlatform, resolveBuildId, install, computeExecutablePath } from '@puppeteer/browsers';
import { renderMarkdown } from './markdownRenderer';
import { getWebviewContent } from '../utils/htmlGenerator';

/**
 * Get or download Chrome executable for PDF export
 */
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

/**
 * Export markdown document to PDF
 */
export async function exportToPDF(document: vscode.TextDocument, context: vscode.ExtensionContext) {
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
