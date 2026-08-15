import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

/**
 * katex's stylesheet, delivered two ways.
 *
 * A webview can load the vendored file and the fonts beside it over
 * `asWebviewUri`. The Chrome export cannot: its page is built with
 * `setContent`, which leaves it on `about:blank`, and Chrome refuses every
 * subresource from there - so that path gets one stylesheet with the fonts
 * already inside it.
 *
 * Desktop only. The web build links the stylesheet and never comes here.
 */

/** Where the build step puts katex, relative to the extension root. */
const vendorSegments = ['media', 'vendor', 'katex'];

let inlinedStylesheet: string | undefined;

/** A <link> to the vendored stylesheet, for a webview that can load files. */
export function getKatexStylesheetTag(webview: vscode.Webview, extensionUri: vscode.Uri): string {
    const uri = webview.asWebviewUri(
        vscode.Uri.joinPath(extensionUri, ...vendorSegments, 'katex.min.css')
    );
    return `<link rel="stylesheet" href="${uri}">`;
}

/**
 * The same stylesheet with every font inlined as a data: URI, for a page that
 * cannot fetch anything.
 *
 * Around 400 KB once encoded, so it is only ever asked for when the document
 * actually contains an equation. Cached: the fonts do not change between
 * exports, and re-encoding them per document is pure waste.
 */
export function getInlinedKatexStyles(extensionUri: vscode.Uri): string {
    if (inlinedStylesheet !== undefined) {
        return inlinedStylesheet;
    }

    const katexDir = path.join(extensionUri.fsPath, ...vendorSegments);

    try {
        const css = fs.readFileSync(path.join(katexDir, 'katex.min.css'), 'utf8');
        inlinedStylesheet = `<style>${inlineFonts(css, path.join(katexDir, 'fonts'))}</style>`;
    } catch {
        // Without the stylesheet the equations still print, in the browser's
        // own fonts. Losing the export over it would be worse.
        inlinedStylesheet = '';
    }

    return inlinedStylesheet;
}

/**
 * Rewrite katex's `url(fonts/KaTeX_Main-Regular.woff2)` references to data:
 * URIs. The woff and ttf alternatives are not vendored, so their rules are
 * left pointing at files that do not exist and never load.
 */
function inlineFonts(css: string, fontsDir: string): string {
    const encoded = new Map<string, string>();

    return css.replace(/url\((fonts\/[^)]+?\.woff2)\)/g, (match, reference: string) => {
        let uri = encoded.get(reference);

        if (uri === undefined) {
            const file = path.join(fontsDir, path.basename(reference));
            if (!fs.existsSync(file)) {
                return match;
            }
            uri = `data:font/woff2;base64,${fs.readFileSync(file).toString('base64')}`;
            encoded.set(reference, uri);
        }

        return `url(${uri})`;
    });
}
