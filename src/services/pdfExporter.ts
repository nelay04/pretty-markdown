import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { execFileSync } from 'child_process';
import { pathToFileURL } from 'url';
import puppeteer, { Browser as PuppeteerBrowser, Page } from 'puppeteer-core';
import {
    Browser,
    BrowserPlatform,
    ChromeReleaseChannel,
    detectBrowserPlatform,
    resolveBuildId,
    install,
    computeSystemExecutablePath,
    getInstalledBrowsers,
} from '@puppeteer/browsers';
import { renderMarkdown, containsMermaid, containsMath } from './markdownRenderer';
import { getWebviewContent } from '../utils/htmlGenerator';
import { exportPdfWithWebview } from './webviewPdfExporter';
import { getMermaidBootScript, getMermaidCleanupScript, mermaidReadyFlag } from '../utils/mermaid';
import {
    getPrintExpandScript,
    getPrintFitScript,
    policyOf,
    OversizedBlockPolicy,
    OversizedBlockSetting,
    PrintFitResult
} from '../utils/printLayout';
import { resolveTheme, getMermaidThemeVariables, ThemeTokens } from './themeManager';
import { getInlinedKatexStyles } from './katexAssets';
import {
    buildMissingLibrariesMessage,
    clearLinkerCache,
    findMissingLibraries,
    findMissingSystemLibraries,
    installChromeLibraries
} from './chromeLibraries';

/**
 * Shared download location, deliberately not inside globalStorageUri: that path
 * differs between VS Code stable, Insiders and the Extension Development Host,
 * which would make each of them download its own copy of Chrome.
 */
function getSharedCacheDir(): string {
    return process.env.PUPPETEER_CACHE_DIR || path.join(os.homedir(), '.cache', 'puppeteer');
}

/**
 * Chrome already installed on the machine, if any. Costs nothing and saves a
 * ~700 MB download.
 */
function findSystemChrome(): string | undefined {
    const channels = [
        ChromeReleaseChannel.STABLE,
        ChromeReleaseChannel.BETA,
        ChromeReleaseChannel.DEV,
        ChromeReleaseChannel.CANARY
    ];

    for (const channel of channels) {
        try {
            const executablePath = computeSystemExecutablePath({ browser: Browser.CHROME, channel });
            if (executablePath && fs.existsSync(executablePath)) {
                return executablePath;
            }
        } catch {
            // Channel not installed on this machine.
        }
    }

    return undefined;
}

/**
 * Compare Chrome build ids such as "151.0.7922.138". These are four-part and
 * therefore not semver, so `getVersionComparator` cannot be used here.
 */
function compareBuildIds(a: string, b: string): number {
    const left = a.split('.').map(Number);
    const right = b.split('.').map(Number);

    for (let i = 0; i < Math.max(left.length, right.length); i++) {
        const diff = (left[i] || 0) - (right[i] || 0);
        if (diff) {
            return diff;
        }
    }

    return 0;
}

/**
 * Newest usable Chrome already present in any of the given caches. Any build
 * works for printing, so an existing one is always preferred over downloading
 * whatever happens to be the current stable release.
 */
async function findCachedChrome(cacheDirs: string[], platform: BrowserPlatform): Promise<string | undefined> {
    const candidates: Array<{ buildId: string; executablePath: string }> = [];

    for (const cacheDir of cacheDirs) {
        if (!fs.existsSync(cacheDir)) {
            continue;
        }

        try {
            const installed = await getInstalledBrowsers({ cacheDir });
            for (const browser of installed) {
                if (browser.browser === Browser.CHROME &&
                    browser.platform === platform &&
                    fs.existsSync(browser.executablePath)) {
                    candidates.push({ buildId: browser.buildId, executablePath: browser.executablePath });
                }
            }
        } catch {
            // Unreadable cache, fall through to the next one.
        }
    }

    candidates.sort((a, b) => compareBuildIds(b.buildId, a.buildId));
    return candidates[0]?.executablePath;
}

/**
 * Remove a half-finished install. An interrupted download leaves the build
 * directory behind without an executable, and every later attempt then fails
 * while unpacking ("end of central directory record signature not found").
 */
function removeBrokenInstall(cacheDir: string, buildId: string, platform: BrowserPlatform): void {
    const buildDir = path.join(cacheDir, 'chrome', `${platform}-${buildId}`);
    try {
        fs.rmSync(buildDir, { recursive: true, force: true });
    } catch {
        // Best effort; install() will surface a clearer error if it still fails.
    }
}

const launchArgs = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'];

/** Set once the install has been offered, so it is only offered up front once. */
const librariesOfferedKey = 'prettyMarkdown.chromeLibrariesOffered';

/** Diagrams should never hold the export open for long. */
const mermaidRenderTimeoutMs = 20000;

/** Paper the PDF is printed on, shared by the print-fit pass below. */
const pageSetup = { pageWidthMm: 210, pageHeightMm: 297, marginSideMm: 5, marginBlockMm: 10 };

/**
 * Fills the page margins with the theme background.
 *
 * Chrome paints a page's background inside the margin box only, so a themed
 * document comes out framed in white paper. Header and footer templates are
 * the one thing that renders in the margin area, and a fixed-position element
 * in one is laid out against the whole page rather than its own band. The
 * frame covers the margins and nothing else, so it cannot hide content.
 */
function getPageMarginFrame(theme: ThemeTokens): string {
    return '<div style="-webkit-print-color-adjust:exact;print-color-adjust:exact;' +
        'position:fixed;top:0;left:0;width:100vw;height:100vh;box-sizing:border-box;' +
        `border-style:solid;border-color:${theme.background};` +
        `border-width:${pageSetup.marginBlockMm}mm ${pageSetup.marginSideMm}mm;"></div>`;
}

/** CSS pixels across the printable width, at the 96 dpi print CSS assumes. */
const printableWidthPx = Math.round((pageSetup.pageWidthMm - 2 * pageSetup.marginSideMm) * 96 / 25.4);

/** Tall enough that nothing lays out differently for want of viewport. */
const viewportHeightPx = 1200;

/**
 * Lay the document out at the width the printer will use.
 *
 * Content that does not fit the paper's width — a wide table, a long line of
 * code — makes Chrome shrink the whole page to fit rather than clip it, and
 * everything then reflows: a page holds more lines than the printable width
 * alone suggests. Measuring at that width is what makes the heights this
 * module works with the printed ones.
 */
async function matchPrintLayoutWidth(page: Page): Promise<void> {
    const overflowWidth = await page.evaluate('document.documentElement.scrollWidth') as number;
    const layoutWidth = Math.max(printableWidthPx, Math.ceil(overflowWidth));
    if (layoutWidth !== printableWidthPx) {
        await page.setViewport({ width: layoutWidth, height: viewportHeightPx });
    }
}

/** How the document's oversized diagrams should be printed. */
function getOversizedDiagramSetting(resource: vscode.Uri): OversizedBlockSetting {
    return vscode.workspace
        .getConfiguration('prettyMarkdown', resource)
        .get<OversizedBlockSetting>('oversizedDiagrams', 'ask');
}

/**
 * Offer the choice between the two ways of printing a diagram that cannot
 * share a page: whole, at the cost of the space left below it, or across the
 * page break, at the cost of a cut through the drawing.
 */
async function askOversizedDiagramPolicy(gaps: PrintFitResult['gaps']): Promise<OversizedBlockPolicy> {
    const subject = gaps.length === 1 ? 'A diagram is' : `${gaps.length} diagrams are`;
    const largest = Math.round(Math.max(...gaps.map(gap => gap.gapRatio)) * 100);

    const choice = await vscode.window.showInformationMessage(
        `${subject} too tall to fit in the space left on the page.`,
        {
            modal: true,
            detail: `Printed whole, each one starts on a fresh page and leaves up to ${largest}% of ` +
                'the page before it blank. Printed across the page break, no space is wasted, but the ' +
                'drawing is cut where the page ends.\n\nSet prettyMarkdown.oversizedDiagrams to stop being asked.'
        },
        'Print whole',
        'Split across pages'
    );

    return choice === 'Split across pages' ? 'split' : 'fit';
}

/**
 * Every Chrome worth trying before falling back to a download, best first.
 */
async function collectChromeCandidates(
    context: vscode.ExtensionContext,
    platform: BrowserPlatform
): Promise<string[]> {
    const candidates: Array<string | undefined> = [];

    candidates.push(process.env.PUPPETEER_EXECUTABLE_PATH);

    const sharedCacheDir = getSharedCacheDir();
    // Older versions of the extension downloaded here; keep reusing those copies.
    const legacyCacheDir = path.join(context.globalStorageUri.fsPath, 'puppeteer');
    candidates.push(await findCachedChrome([sharedCacheDir, legacyCacheDir], platform));

    candidates.push(findSystemChrome());

    return candidates.filter((candidate): candidate is string => {
        if (!candidate || !fs.existsSync(candidate)) {
            return false;
        }
        // Under WSL the system lookup resolves to Chrome on the Windows side,
        // which cannot be driven from the Linux process.
        if (process.platform !== 'win32' && candidate.toLowerCase().endsWith('.exe')) {
            return false;
        }
        return true;
    });
}

/**
 * Download Chrome into the shared cache, healing a previously interrupted
 * download if one is in the way.
 */
async function downloadChrome(
    platform: BrowserPlatform,
    progress: vscode.Progress<{ message?: string; increment?: number }>
): Promise<string> {
    const cacheDir = getSharedCacheDir();
    fs.mkdirSync(cacheDir, { recursive: true });

    const buildId = await resolveBuildId(Browser.CHROME, platform, 'stable');
    removeBrokenInstall(cacheDir, buildId, platform);

    let lastReported = 0;
    const downloadProgressCallback = (downloadedBytes: number, totalBytes: number) => {
        if (!totalBytes) {
            return;
        }
        const percent = Math.floor((downloadedBytes / totalBytes) * 100);
        if (percent > lastReported) {
            lastReported = percent;
            const mb = Math.round(totalBytes / 1024 / 1024);
            progress.report({ message: `Downloading Chrome (first time only) — ${percent}% of ${mb} MB` });
        }
    };

    progress.report({ increment: 10, message: 'Downloading Chrome (first time only)...' });

    try {
        const installed = await install({
            browser: Browser.CHROME,
            buildId,
            cacheDir,
            platform,
            downloadProgressCallback
        });
        return installed.executablePath;
    } catch {
        // A corrupt or partial archive cannot be recovered in place; clear it
        // and give the download exactly one more chance.
        removeBrokenInstall(cacheDir, buildId, platform);
        progress.report({ message: 'Download failed, retrying...' });
        lastReported = 0;

        const installed = await install({
            browser: Browser.CHROME,
            buildId,
            cacheDir,
            platform,
            downloadProgressCallback
        });
        return installed.executablePath;
    }
}

/**
 * Launch Chrome for PDF export, downloading one only when nothing already on
 * the machine can be launched.
 */
async function launchChrome(
    context: vscode.ExtensionContext,
    progress: vscode.Progress<{ message?: string; increment?: number }>
): Promise<PuppeteerBrowser> {
    const platform = detectBrowserPlatform();
    if (!platform) {
        throw new Error('Unsupported platform for Chrome download.');
    }

    const candidates = await collectChromeCandidates(context, platform);
    const missingLibraries = new Set<string>();

    for (const executablePath of candidates) {
        try {
            return await puppeteer.launch({ executablePath, headless: true, args: launchArgs });
        } catch (error) {
            // Present but unusable (wrong architecture, missing system
            // libraries, partially deleted). Try the next candidate.
            for (const library of findMissingLibraries(error, executablePath)) {
                missingLibraries.add(library);
            }
        }
    }

    // Downloading a browser cannot supply a missing system library, so check
    // the system itself rather than inferring it from a launch failure: with
    // no Chrome installed there is no failure to learn from, and the user
    // would spend a 185 MB download on a browser that cannot start.
    for (const library of findMissingSystemLibraries()) {
        missingLibraries.add(library);
    }

    if (missingLibraries.size > 0) {
        const libraries = [...missingLibraries];

        // Offered once. After that the export goes straight to the fallback
        // rather than opening a dialog on every attempt; the offer is made
        // again from the notification that follows the export.
        if (context.globalState.get<boolean>(librariesOfferedKey) !== true) {
            await context.globalState.update(librariesOfferedKey, true);

            const choice = await vscode.window.showInformationMessage(
                'Chrome cannot start on this machine because some system libraries are missing.',
                {
                    modal: true,
                    detail: `Pretty Markdown can install them for you (${libraries.join(', ')}). ` +
                        'They are small, come from your distribution\'s own package manager, and are a one-time step ' +
                        'that gives you PDFs with selectable, searchable text.\n\n' +
                        'The built-in converter needs nothing installed, but its output is an image.'
                },
                'Install libraries',
                'Use built-in converter'
            );

            if (choice === 'Install libraries' && await installChromeLibraries(libraries)) {
                // Installed: this run can have the browser it came for.
                return await launchChrome(context, progress);
            }
        }

        throw new Error(buildMissingLibrariesMessage(libraries));
    }

    // The download is large and one-time; let the user opt for the built-in
    // converter instead of spending it.
    const choice = await vscode.window.showInformationMessage(
        'Pretty Markdown uses Chrome to produce PDFs with selectable text. No Chrome was found on this machine.',
        { modal: true, detail: 'Downloading is a one-time ~185 MB step. The built-in converter needs no download, but its output is an image, so the text cannot be selected or searched.' },
        'Download Chrome',
        'Use built-in converter'
    );

    if (choice !== 'Download Chrome') {
        throw new Error('No Chrome available and the download was declined.');
    }

    const downloaded = await downloadChrome(platform, progress);

    try {
        return await puppeteer.launch({ executablePath: downloaded, headless: true, args: launchArgs });
    } catch (error) {
        const missing = findMissingLibraries(error, downloaded);
        if (missing.length > 0) {
            throw new Error(buildMissingLibrariesMessage(missing));
        }
        throw error;
    }
}

/**
 * Remove a partial install left behind in the legacy per-profile cache.
 */
export function cleanupLegacyBrowserCache(context: vscode.ExtensionContext): void {
    const legacyCacheDir = path.join(context.globalStorageUri.fsPath, 'puppeteer', 'chrome');
    if (!fs.existsSync(legacyCacheDir)) {
        return;
    }

    try {
        for (const entry of fs.readdirSync(legacyCacheDir)) {
            const buildDir = path.join(legacyCacheDir, entry);
            const hasExecutable = fs.existsSync(path.join(buildDir, 'chrome-linux64', 'chrome')) ||
                fs.existsSync(path.join(buildDir, 'chrome-win64', 'chrome.exe')) ||
                fs.existsSync(path.join(buildDir, 'chrome-mac-x64', 'Google Chrome for Testing.app')) ||
                fs.existsSync(path.join(buildDir, 'chrome-mac-arm64', 'Google Chrome for Testing.app'));

            if (!hasExecutable) {
                fs.rmSync(buildDir, { recursive: true, force: true });
            }
        }
    } catch {
        // Cleanup is opportunistic.
    }
}

/**
 * Close the browser without letting a wedged Chrome hang the export. The
 * progress notification stays on screen until this whole task settles, so a
 * close that never resolves would leave it stuck forever.
 */
async function closeBrowserSafely(browser: PuppeteerBrowser): Promise<void> {
    const killTimeout = 5000;

    try {
        await Promise.race([
            browser.close(),
            new Promise((resolve, reject) => setTimeout(() => reject(new Error('close timed out')), killTimeout))
        ]);
    } catch {
        try {
            browser.process()?.kill('SIGKILL');
        } catch {
            // Nothing further we can do; the export itself already finished.
        }
    }
}

const imageMimeTypes: { [extension: string]: string } = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
    '.ico': 'image/x-icon',
    '.avif': 'image/avif'
};

/** Images beyond this are left as a link rather than inlined. */
const maxInlineImageBytes = 20 * 1024 * 1024;

/**
 * Inline a local image as a data URI.
 *
 * Both export paths need this: Chrome refuses to load file:// subresources
 * into a page created with setContent, and the fallback webview may only read
 * from the extension's own folder.
 */
function inlineImage(absolutePath: string): string | undefined {
    try {
        const stats = fs.statSync(absolutePath);
        if (!stats.isFile() || stats.size > maxInlineImageBytes) {
            return undefined;
        }

        const mimeType = imageMimeTypes[path.extname(absolutePath).toLowerCase()];
        if (!mimeType) {
            return undefined;
        }

        return `data:${mimeType};base64,${fs.readFileSync(absolutePath).toString('base64')}`;
    } catch {
        return undefined;
    }
}

/**
 * Draw the page's mermaid diagrams before printing.
 *
 * Diagram failures must not sink the export, so a timeout or a missing library
 * simply leaves the diagram as its source text in the PDF.
 */
async function renderMermaidDiagrams(page: Page, context: vscode.ExtensionContext, theme: ThemeTokens): Promise<void> {
    const mermaidPath = path.join(context.extensionPath, 'media', 'vendor', 'mermaid.min.js');

    if (!fs.existsSync(mermaidPath)) {
        return;
    }

    try {
        await page.addScriptTag({ path: mermaidPath });
        await page.evaluate(getMermaidBootScript({ variables: getMermaidThemeVariables(theme) }));
        await page.waitForFunction(`window.${mermaidReadyFlag} === true`, { timeout: mermaidRenderTimeoutMs });
        await page.evaluate(getMermaidCleanupScript());
    } catch {
        // Leave the source text in place rather than failing the export.
    }
}

/**
 * Fallback export for machines where Chrome cannot run. Produces a rasterised
 * PDF, so the reason Chrome was unavailable is surfaced to the user.
 */
async function exportWithoutBrowser(
    document: vscode.TextDocument,
    context: vscode.ExtensionContext,
    fullHtml: string,
    progress: vscode.Progress<{ message?: string; increment?: number }>,
    launchError: unknown,
    theme: ThemeTokens,
    policy: OversizedBlockPolicy
): Promise<void> {
    const defaultPath = document.fileName.replace(/\.md$/, '.pdf');
    const pdfPath = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(defaultPath),
        filters: { 'PDF': ['pdf'] }
    });

    if (!pdfPath) {
        return;
    }

    progress.report({ increment: 30, message: 'Chrome unavailable, using built-in converter...' });
    await exportPdfWithWebview(context, fullHtml, pdfPath, theme, policy, stage => {
        progress.report({ message: `Built-in converter: ${stage}` });
    });
    progress.report({ increment: 40, message: 'Done!' });

    // Not awaited: the progress notification stays on screen until this task
    // settles, and waiting on a message the user may never click would pin it.
    const reason = launchError instanceof Error ? launchError.message : String(launchError);
    const missingLibraries = findMissingSystemLibraries();
    const actions = missingLibraries.length > 0 ? ['Install libraries', 'Why?'] : ['Why?'];

    void vscode.window.showWarningMessage(
        `PDF exported to ${path.basename(pdfPath.fsPath)} without Chrome, so its text is not selectable.` +
        (missingLibraries.length > 0
            ? ' Installing a few system libraries would give you real text, a smaller file and cleaner page breaks.'
            : ''),
        ...actions
    ).then(async selection => {
        if (selection === 'Why?') {
            void vscode.window.showInformationMessage(reason);
            return;
        }
        if (selection === 'Install libraries' && await installChromeLibraries(missingLibraries)) {
            void vscode.window.showInformationMessage(
                'Chrome can now start. Export again for a PDF with selectable text.'
            );
        }
    });
}

/**
 * Export markdown document to PDF
 */
export async function exportToPDF(document: vscode.TextDocument, context: vscode.ExtensionContext) {
    const documentDir = path.dirname(document.fileName);

    const html = renderMarkdown(document.getText(), {
        resolveImage: (src) => {
            try {
                const absolutePath = path.resolve(documentDir, decodeURIComponent(src));
                return inlineImage(absolutePath) || pathToFileURL(absolutePath).toString();
            } catch {
                return src;
            }
        }
    });
    const theme = resolveTheme(document.uri);
    const title = path.basename(document.fileName);
    const needsMath = containsMath(html);

    // Chrome refuses subresources in a setContent page, so the equation fonts
    // have to travel inside the document itself. The fallback runs in a
    // webview, which can load the vendored stylesheet instead: pushing 360 KB
    // of inlined fonts through html2canvas only makes a slow path slower.
    const fullHtml = getWebviewContent(html, title, {
        theme,
        head: needsMath ? getInlinedKatexStyles(context.extensionUri) : undefined
    });
    const fallbackHtml = needsMath ? getWebviewContent(html, title, { theme }) : fullHtml;
    const needsMermaid = containsMermaid(html);

    vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Exporting to PDF...",
        cancellable: false
    }, async (progress) => {
        try {
            progress.report({ increment: 10, message: "Preparing browser..." });

            let browser;
            try {
                browser = await launchChrome(context, progress);
            } catch (launchError) {
                // No usable Chrome on this machine; fall back to the bundled
                // converter rather than failing the export outright.
                await exportWithoutBrowser(
                    document, context, fallbackHtml, progress, launchError, theme,
                    policyOf(getOversizedDiagramSetting(document.uri))
                );
                return;
            }

            progress.report({ increment: 30, message: "Rendering document..." });

            try {
                const page = await browser.newPage();
                await page.setContent(fullHtml, { waitUntil: 'networkidle0' });

                // Lay the page out exactly as it will be printed, so diagrams
                // are drawn at their final width and the fit pass below
                // measures the heights the printed pages will actually have.
                await page.emulateMediaType('print');
                await page.setViewport({ width: printableWidthPx, height: viewportHeightPx });

                if (needsMermaid) {
                    progress.report({ message: 'Rendering diagrams...' });
                    await renderMermaidDiagrams(page, context, theme);
                }

                // A section left collapsed would print as its summary alone.
                await page.evaluate(getPrintExpandScript());

                await matchPrintLayoutWidth(page);

                // Shrink anything too tall to share a page, which would
                // otherwise leave a page-sized gap where it did not fit.
                const setting = getOversizedDiagramSetting(document.uri);
                const fit = await page.evaluate(
                    getPrintFitScript({ ...pageSetup, policy: policyOf(setting) })
                ) as PrintFitResult;

                // Only a diagram kept whole leaves a gap, and only the user can
                // say whether the gap or a cut diagram is the lesser evil.
                const stranded = fit.gaps.filter(gap => !gap.split);
                if (setting === 'ask' && stranded.length > 0) {
                    if (await askOversizedDiagramPolicy(stranded) === 'split') {
                        await page.evaluate(getPrintFitScript({ ...pageSetup, policy: 'split' }));
                    }
                }

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
                            top: `${pageSetup.marginBlockMm}mm`,
                            right: `${pageSetup.marginSideMm}mm`,
                            bottom: `${pageSetup.marginBlockMm}mm`,
                            left: `${pageSetup.marginSideMm}mm`
                        },
                        printBackground: true,
                        // Paints the margins, which printBackground does not.
                        displayHeaderFooter: true,
                        headerTemplate: getPageMarginFrame(theme),
                        footerTemplate: '<span></span>'
                    });

                    progress.report({ increment: 20, message: "Done!" });

                    vscode.window.showInformationMessage(`PDF exported successfully to ${path.basename(pdfPath.fsPath)}`);
                }
            } finally {
                await closeBrowserSafely(browser);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to export PDF: ${error}`);
        }
    });
}
