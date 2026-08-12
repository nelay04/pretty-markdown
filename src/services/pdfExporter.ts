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
import { renderMarkdown, containsMermaid } from './markdownRenderer';
import { getWebviewContent } from '../utils/htmlGenerator';
import { exportPdfWithWebview } from './webviewPdfExporter';
import { getMermaidBootScript, getMermaidCleanupScript, mermaidReadyFlag } from '../utils/mermaid';
import { resolveTheme, getMermaidThemeVariables, ThemeTokens } from './themeManager';

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

/** Diagrams should never hold the export open for long. */
const mermaidRenderTimeoutMs = 20000;

/**
 * Packages providing the libraries Chrome most often lacks. Only Linux needs
 * this: the Windows and macOS builds of Chrome are self-contained.
 */
const libraryPackages: { [library: string]: { debian: string; fedora: string; arch: string } } = {
    'libnspr4.so': { debian: 'libnspr4', fedora: 'nspr', arch: 'nspr' },
    'libnss3.so': { debian: 'libnss3', fedora: 'nss', arch: 'nss' },
    'libnssutil3.so': { debian: 'libnss3', fedora: 'nss', arch: 'nss' },
    'libsmime3.so': { debian: 'libnss3', fedora: 'nss', arch: 'nss' },
    'libasound.so.2': { debian: 'libasound2t64', fedora: 'alsa-lib', arch: 'alsa-lib' },
    'libatk-1.0.so.0': { debian: 'libatk1.0-0', fedora: 'atk', arch: 'atk' },
    'libatk-bridge-2.0.so.0': { debian: 'libatk-bridge2.0-0', fedora: 'at-spi2-atk', arch: 'at-spi2-core' },
    'libcups.so.2': { debian: 'libcups2', fedora: 'cups-libs', arch: 'libcups' },
    'libdrm.so.2': { debian: 'libdrm2', fedora: 'libdrm', arch: 'libdrm' },
    'libgbm.so.1': { debian: 'libgbm1', fedora: 'mesa-libgbm', arch: 'mesa' },
    'libgtk-3.so.0': { debian: 'libgtk-3-0', fedora: 'gtk3', arch: 'gtk3' },
    'libpango-1.0.so.0': { debian: 'libpango-1.0-0', fedora: 'pango', arch: 'pango' },
    'libxkbcommon.so.0': { debian: 'libxkbcommon0', fedora: 'libxkbcommon', arch: 'libxkbcommon' },
    'libxcomposite.so.1': { debian: 'libxcomposite1', fedora: 'libXcomposite', arch: 'libxcomposite' },
    'libxdamage.so.1': { debian: 'libxdamage1', fedora: 'libXdamage', arch: 'libxdamage' },
    'libxfixes.so.3': { debian: 'libxfixes3', fedora: 'libXfixes', arch: 'libxfixes' },
    'libxrandr.so.2': { debian: 'libxrandr2', fedora: 'libXrandr', arch: 'libxrandr' }
};

/** Libraries Chrome cannot start without, checked before offering a download. */
const requiredLibraries = [
    'libnspr4.so',
    'libnss3.so',
    'libnssutil3.so',
    'libsmime3.so',
    'libasound.so.2'
];

let cachedLinkerLibraries: Set<string> | undefined;

/**
 * Every library name the dynamic linker knows about, read once per session.
 */
function getLinkerLibraries(): Set<string> {
    if (cachedLinkerLibraries) {
        return cachedLinkerLibraries;
    }

    const names = new Set<string>();
    for (const ldconfig of ['ldconfig', '/sbin/ldconfig', '/usr/sbin/ldconfig']) {
        try {
            const output = execFileSync(ldconfig, ['-p'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
            for (const match of output.matchAll(/^\s*(\S+\.so[^\s]*)/gm)) {
                names.add(match[1]);
            }
            break;
        } catch {
            // Try the next location.
        }
    }

    cachedLinkerLibraries = names;
    return names;
}

/**
 * Libraries Chrome needs that this system does not have.
 *
 * Downloading a browser cannot fix a missing system library, so this is
 * checked before ever proposing the download.
 */
function findMissingSystemLibraries(): string[] {
    if (process.platform !== 'linux') {
        return [];
    }

    const linkerLibraries = getLinkerLibraries();
    if (linkerLibraries.size === 0) {
        // No usable ldconfig; do not guess that libraries are missing.
        return [];
    }

    const searchPaths = (process.env.LD_LIBRARY_PATH || '').split(path.delimiter).filter(Boolean);

    return requiredLibraries.filter(library => {
        if (linkerLibraries.has(library)) {
            return false;
        }
        return !searchPaths.some(dir => fs.existsSync(path.join(dir, library)));
    });
}

/**
 * Which package manager to suggest. Package names differ per distribution, so
 * suggesting `apt` on Fedora would just waste the user's time.
 */
function detectDistroFamily(): { family: 'debian' | 'fedora' | 'arch'; installCommand: string } | undefined {
    let osRelease = '';
    try {
        osRelease = fs.readFileSync('/etc/os-release', 'utf8').toLowerCase();
    } catch {
        return undefined;
    }

    if (/\b(debian|ubuntu|linuxmint|pop)\b/.test(osRelease)) {
        return { family: 'debian', installCommand: 'sudo apt install -y' };
    }
    if (/\b(fedora|rhel|centos|rocky|almalinux)\b/.test(osRelease)) {
        return { family: 'fedora', installCommand: 'sudo dnf install -y' };
    }
    if (/\b(arch|manjaro|endeavouros)\b/.test(osRelease)) {
        return { family: 'arch', installCommand: 'sudo pacman -S --noconfirm' };
    }

    return undefined;
}

/**
 * Shared libraries Chrome reported as missing, if that is why it failed.
 *
 * Chrome only names the first one it hits, which would send the user through
 * one install per library, so ask `ldd` for the full list up front.
 */
function findMissingLibraries(error: unknown, executablePath: string): string[] {
    const message = error instanceof Error ? error.message : String(error);
    const matches = [...message.matchAll(/error while loading shared libraries: ([^:]+):/g)];
    if (matches.length === 0) {
        return [];
    }

    const reported = matches.map(match => match[1]);

    try {
        const output = execFileSync('ldd', [executablePath], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
        const missing = [...output.matchAll(/^\s*(\S+)\s*=>\s*not found/gm)].map(match => match[1]);
        if (missing.length > 0) {
            return [...new Set(missing)];
        }
    } catch {
        // No ldd, or it failed; fall back to what Chrome told us.
    }

    return [...new Set(reported)];
}

function buildMissingLibrariesMessage(libraries: string[]): string {
    const distro = detectDistroFamily();
    const packages = distro
        ? [...new Set(libraries.map(library => libraryPackages[library]?.[distro.family]).filter(Boolean))]
        : [];

    const installHint = packages.length > 0
        ? `Install them with: ${distro?.installCommand} ${packages.join(' ')}`
        : 'Install the system packages providing them for your distribution.';

    return `Chrome cannot start because system libraries are missing (${libraries.join(', ')}). ` +
        `${installHint} ` +
        'Alternatively set PUPPETEER_EXECUTABLE_PATH to a working Chrome.';
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
) {
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
        throw new Error(buildMissingLibrariesMessage([...missingLibraries]));
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
    theme: ThemeTokens
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
    await exportPdfWithWebview(context, fullHtml, pdfPath, theme);
    progress.report({ increment: 40, message: 'Done!' });

    // Not awaited: the progress notification stays on screen until this task
    // settles, and waiting on a message the user may never click would pin it.
    const reason = launchError instanceof Error ? launchError.message : String(launchError);
    void vscode.window.showWarningMessage(
        `PDF exported to ${path.basename(pdfPath.fsPath)} without Chrome, so its text is not selectable.`,
        'Why?'
    ).then(selection => {
        if (selection === 'Why?') {
            vscode.window.showInformationMessage(reason);
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
    const fullHtml = getWebviewContent(html, path.basename(document.fileName), { theme });
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
                await exportWithoutBrowser(document, context, fullHtml, progress, launchError, theme);
                return;
            }

            progress.report({ increment: 30, message: "Rendering document..." });

            try {
                const page = await browser.newPage();
                await page.setContent(fullHtml, { waitUntil: 'networkidle0' });

                if (needsMermaid) {
                    progress.report({ message: 'Rendering diagrams...' });
                    await renderMermaidDiagrams(page, context, theme);
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
                            top: '10mm',
                            right: '10mm',
                            bottom: '10mm',
                            left: '10mm'
                        },
                        printBackground: true
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
