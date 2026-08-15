// Repo rules no linter covers, checked against what is actually staged.
//
// Only the lines a commit ADDS are examined. Files that already break a rule —
// the README's marketing line, esbuild's error glyph — are left alone until
// someone touches them, so the hook never blocks work it has no quarrel with.

const { execFileSync } = require('child_process');

/** Files whose staged lines are worth reading as text. */
const textFile = /\.(ts|js|mjs|cjs|json|jsonc|md|sh|yml|yaml|html|css)$/i;

/**
 * Emoji, which this repository keeps out of code, comments and documentation.
 * VS Code $(codicon) references are plain ASCII, and so are unaffected.
 */
const emoji = /[\u{1F000}-\u{1FAFF}\u{1F1E6}-\u{1F1FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;

/**
 * Half a conflict left in the file. Only the two arrow markers are looked for:
 * a row of seven equals signs is also how Markdown underlines a heading.
 */
const conflictMarker = /^(<{7}|>{7})(\s|$)/;

const rules = [
    { test: (line) => conflictMarker.test(line), reason: 'merge conflict marker' },
    { test: (line) => emoji.test(line), reason: 'emoji' }
];

/** Every line this commit adds, as { file, line, text }. */
function getAddedLines() {
    const diff = execFileSync(
        'git',
        ['diff', '--cached', '--unified=0', '--no-color', '--diff-filter=ACM'],
        { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
    );

    const added = [];
    let file = '';
    let lineNumber = 0;

    for (const raw of diff.split('\n')) {
        if (raw.startsWith('+++ ')) {
            // '+++ b/path', or '+++ /dev/null' for a deletion.
            const target = raw.slice(4);
            file = target.startsWith('b/') ? target.slice(2) : '';
            continue;
        }

        const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
        if (hunk) {
            lineNumber = Number(hunk[1]);
            continue;
        }

        if (!raw.startsWith('+') || !file) {
            continue;
        }

        if (textFile.test(file)) {
            added.push({ file, line: lineNumber, text: raw.slice(1) });
        }
        lineNumber++;
    }

    return added;
}

function main() {
    const problems = [];

    for (const { file, line, text } of getAddedLines()) {
        for (const rule of rules) {
            if (rule.test(text)) {
                problems.push(`${file}:${line}  ${rule.reason}\n    ${text.trim().slice(0, 100)}`);
            }
        }
    }

    if (problems.length === 0) {
        return 0;
    }

    console.error(`${problems.length} staged line(s) break a repository rule:\n`);
    console.error(problems.join('\n'));
    console.error('\nEmoji belong in neither code, comments nor documentation; see .claude/CLAUDE.md.');
    return 1;
}

process.exit(main());
