import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { execFile, execFileSync } from 'child_process';

/**
 * The system libraries Chrome needs on Linux, and getting them installed.
 *
 * Only Linux needs any of this: the Windows and macOS builds of Chrome are
 * self-contained, so every function here returns early elsewhere.
 */

/** Libraries Chrome cannot start without, checked before offering a download. */
const requiredLibraries = [
    'libnspr4.so',
    'libnss3.so',
    'libnssutil3.so',
    'libsmime3.so',
    'libasound.so.2'
];

/**
 * Packages providing those libraries, best candidate first.
 *
 * Debian names are lists because of the 64-bit time_t transition: Ubuntu 24.04
 * renamed `libasound2` to `libasound2t64` and did the same to several others,
 * so 22.04 and 24.04+ need different names for the same library. Which one
 * exists is asked of the package manager rather than worked out from the
 * release number, which also covers Debian and the Ubuntu derivatives.
 */
const libraryPackages: { [library: string]: { debian: string[]; fedora: string[]; arch: string[] } } = {
    'libnspr4.so': { debian: ['libnspr4'], fedora: ['nspr'], arch: ['nspr'] },
    'libnss3.so': { debian: ['libnss3'], fedora: ['nss'], arch: ['nss'] },
    'libnssutil3.so': { debian: ['libnss3'], fedora: ['nss'], arch: ['nss'] },
    'libsmime3.so': { debian: ['libnss3'], fedora: ['nss'], arch: ['nss'] },
    'libasound.so.2': { debian: ['libasound2t64', 'libasound2'], fedora: ['alsa-lib'], arch: ['alsa-lib'] },
    'libatk-1.0.so.0': { debian: ['libatk1.0-0t64', 'libatk1.0-0'], fedora: ['atk'], arch: ['atk'] },
    'libatk-bridge-2.0.so.0': { debian: ['libatk-bridge2.0-0t64', 'libatk-bridge2.0-0'], fedora: ['at-spi2-atk'], arch: ['at-spi2-core'] },
    'libcups.so.2': { debian: ['libcups2t64', 'libcups2'], fedora: ['cups-libs'], arch: ['libcups'] },
    'libdrm.so.2': { debian: ['libdrm2'], fedora: ['libdrm'], arch: ['libdrm'] },
    'libgbm.so.1': { debian: ['libgbm1'], fedora: ['mesa-libgbm'], arch: ['mesa'] },
    'libgtk-3.so.0': { debian: ['libgtk-3-0t64', 'libgtk-3-0'], fedora: ['gtk3'], arch: ['gtk3'] },
    'libpango-1.0.so.0': { debian: ['libpango-1.0-0'], fedora: ['pango'], arch: ['pango'] },
    'libxkbcommon.so.0': { debian: ['libxkbcommon0'], fedora: ['libxkbcommon'], arch: ['libxkbcommon'] },
    'libxcomposite.so.1': { debian: ['libxcomposite1'], fedora: ['libXcomposite'], arch: ['libxcomposite'] },
    'libxdamage.so.1': { debian: ['libxdamage1'], fedora: ['libXdamage'], arch: ['libxdamage'] },
    'libxfixes.so.3': { debian: ['libxfixes3'], fedora: ['libXfixes'], arch: ['libxfixes'] },
    'libxrandr.so.2': { debian: ['libxrandr2'], fedora: ['libXrandr'], arch: ['libxrandr'] }
};

interface DistroFamily {
    family: 'debian' | 'fedora' | 'arch';
    /** Argv that installs the packages appended to it, without `sudo`. */
    installArgv: string[];
    /** Argv that reports whether a package name exists in the archive. */
    availabilityArgv: (name: string) => string[];
}

let cachedLinkerLibraries: Set<string> | undefined;

/** Every library name the dynamic linker knows about, read once per session. */
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

/** Forget the cache, so a fresh install is noticed without a reload. */
export function clearLinkerCache(): void {
    cachedLinkerLibraries = undefined;
}

/**
 * Libraries Chrome needs that this system does not have.
 *
 * Downloading a browser cannot fix a missing system library, so this is
 * checked before ever proposing the download.
 */
export function findMissingSystemLibraries(): string[] {
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
 * Shared libraries Chrome reported as missing, if that is why it failed.
 *
 * Chrome only names the first one it hits, which would send the user through
 * one install per library, so ask `ldd` for the full list up front.
 */
export function findMissingLibraries(error: unknown, executablePath: string): string[] {
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

/**
 * Which package manager to drive. Package names differ per distribution, so
 * running `apt` on Fedora would just waste the user's time.
 */
function detectDistroFamily(): DistroFamily | undefined {
    let osRelease = '';
    try {
        osRelease = fs.readFileSync('/etc/os-release', 'utf8').toLowerCase();
    } catch {
        return undefined;
    }

    if (/\b(debian|ubuntu|linuxmint|pop)\b/.test(osRelease)) {
        return {
            family: 'debian',
            installArgv: ['apt-get', 'install', '-y'],
            availabilityArgv: (name) => ['apt-cache', 'policy', name]
        };
    }
    if (/\b(fedora|rhel|centos|rocky|almalinux)\b/.test(osRelease)) {
        return {
            family: 'fedora',
            installArgv: ['dnf', 'install', '-y'],
            availabilityArgv: (name) => ['dnf', 'list', '--available', name]
        };
    }
    if (/\b(arch|manjaro|endeavouros)\b/.test(osRelease)) {
        return {
            family: 'arch',
            installArgv: ['pacman', '-S', '--noconfirm'],
            availabilityArgv: (name) => ['pacman', '-Si', name]
        };
    }

    return undefined;
}

/** Whether the package manager knows this name on this release. */
function isPackageAvailable(distro: DistroFamily, name: string): boolean {
    try {
        const [command, ...args] = distro.availabilityArgv(name);
        const output = execFileSync(command, args, {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
            timeout: 15000
        });
        // apt-cache prints nothing at all for a name it does not know.
        return output.trim().length > 0;
    } catch {
        return false;
    }
}

/** What to install for a set of missing libraries, in this distro's names. */
export function resolveLibraryPackages(libraries: string[]): { packages: string[]; distro?: DistroFamily } {
    const distro = detectDistroFamily();
    if (!distro) {
        return { packages: [] };
    }

    const packages = new Set<string>();
    for (const library of libraries) {
        const candidates = libraryPackages[library]?.[distro.family] || [];
        // The first candidate this release actually has; the rest are the
        // names other releases use for the same thing.
        const available = candidates.find(name => isPackageAvailable(distro, name));
        if (available) {
            packages.add(available);
        } else if (candidates.length > 0) {
            packages.add(candidates[0]);
        }
    }

    return { packages: [...packages], distro };
}

/** The command a user would type, for messages and for the terminal. */
export function buildInstallCommand(packages: string[], distro?: DistroFamily): string | undefined {
    if (!distro || packages.length === 0) {
        return undefined;
    }
    return `sudo ${distro.installArgv.join(' ')} ${packages.join(' ')}`;
}

export function buildMissingLibrariesMessage(libraries: string[]): string {
    const { packages, distro } = resolveLibraryPackages(libraries);
    const command = buildInstallCommand(packages, distro);

    const installHint = command
        ? `Install them with: ${command}`
        : 'Install the system packages providing them for your distribution.';

    return `Chrome cannot start because system libraries are missing (${libraries.join(', ')}). ` +
        `${installHint} ` +
        'Alternatively set PUPPETEER_EXECUTABLE_PATH to a working Chrome.';
}

/** Whether this machine grants root without asking for a password. */
function hasPasswordlessSudo(): boolean {
    try {
        execFileSync('sudo', ['-n', 'true'], { stdio: 'ignore', timeout: 5000 });
        return true;
    } catch {
        return false;
    }
}

function runAsRoot(argv: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
        const [command, ...args] = argv;
        execFile('sudo', ['-n', command, ...args], { timeout: 600000 }, (error, stdout, stderr) => {
            if (error) {
                reject(new Error(stderr?.trim() || error.message));
                return;
            }
            resolve();
        });
    });
}

/**
 * Wait for the libraries to appear, which is how an install run in a terminal
 * reports success: the terminal is the user's, so its exit code is not ours to
 * read, but the libraries showing up says the same thing.
 */
function waitForLibraries(timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;

    return new Promise((resolve) => {
        const poll = () => {
            clearLinkerCache();
            if (findMissingSystemLibraries().length === 0) {
                resolve(true);
                return;
            }
            if (Date.now() > deadline) {
                resolve(false);
                return;
            }
            setTimeout(poll, 2000);
        };

        setTimeout(poll, 2000);
    });
}

/**
 * Install the packages providing `libraries`, and report whether Chrome can
 * now start.
 *
 * Installing system packages needs root. Where sudo is configured to give it
 * without a password this runs unattended; everywhere else the command goes
 * into a terminal, because the alternative is asking for a password in a
 * dialog and handing it to `sudo` ourselves, which no extension should do.
 */
export async function installChromeLibraries(libraries: string[]): Promise<boolean> {
    const { packages, distro } = resolveLibraryPackages(libraries);
    const command = buildInstallCommand(packages, distro);

    if (!distro || !command || packages.length === 0) {
        void vscode.window.showErrorMessage(
            'Pretty Markdown could not work out which packages provide the missing libraries on this distribution. ' +
            'Install them by hand, or set PUPPETEER_EXECUTABLE_PATH to a working Chrome.'
        );
        return false;
    }

    if (hasPasswordlessSudo()) {
        return vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Installing ${packages.join(', ')}...`,
            cancellable: false
        }, async () => {
            try {
                await runAsRoot([...distro.installArgv, ...packages]);
            } catch (error) {
                void vscode.window.showErrorMessage(
                    `Installing the libraries failed: ${error instanceof Error ? error.message : String(error)}`
                );
                return false;
            }

            clearLinkerCache();
            return findMissingSystemLibraries().length === 0;
        });
    }

    const terminal = vscode.window.createTerminal('Pretty Markdown: Chrome libraries');
    terminal.show();
    terminal.sendText(command);

    return vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Waiting for the libraries to install',
        cancellable: true
    }, async (progress, token) => {
        const installed = await Promise.race([
            waitForLibraries(300000),
            new Promise<boolean>(resolve => token.onCancellationRequested(() => resolve(false)))
        ]);

        if (installed) {
            terminal.dispose();
        }
        return installed;
    });
}
