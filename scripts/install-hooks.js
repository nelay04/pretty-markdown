// Point git at .githooks, so the hook is version-controlled rather than copied
// into .git/hooks where it would quietly rot out of date.
//
// Run by npm's prepare lifecycle, which fires after a plain `npm install`: a
// fresh clone is set up by the install it already has to do, and nothing new
// has to be remembered. It must never fail that install, so everything here
// gives up quietly rather than throwing.

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const hooksPath = '.githooks';

function git(args) {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

function main() {
    // Installed as a dependency, unpacked from a tarball, or built in an image
    // without git: none of those want a hook.
    try {
        git(['rev-parse', '--git-dir']);
    } catch {
        return;
    }

    const hookFile = path.join(hooksPath, 'pre-commit');
    if (!fs.existsSync(hookFile)) {
        return;
    }

    let current = '';
    try {
        current = git(['config', '--get', 'core.hooksPath']);
    } catch {
        // Unset, which git reports as a non-zero exit rather than an empty value.
    }

    if (current !== hooksPath) {
        git(['config', 'core.hooksPath', hooksPath]);
        console.log(`Pretty Markdown: git hooks enabled from ${hooksPath}/`);
    }

    // A checkout on a filesystem without an executable bit hands git a hook it
    // will not run, and says nothing about why.
    try {
        fs.chmodSync(hookFile, 0o755);
    } catch {
        // Windows and some network filesystems, where the bit is meaningless.
    }
}

try {
    main();
} catch (error) {
    console.log(`Pretty Markdown: skipped git hook setup (${error.message})`);
}
