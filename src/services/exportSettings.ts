import * as vscode from 'vscode';

/**
 * How long the stages of a PDF export are given, in milliseconds.
 *
 * Zero means "as long as it takes" throughout — the value puppeteer's own
 * timeout options already read that way, so a configured 0 can be passed
 * straight through.
 */
export interface ExportTimeouts {
    /** Laying the document out: Chrome's page load, or the whole conversion. */
    documentMs: number;
    /** Drawing the document's diagrams. */
    diagramMs: number;
}

/**
 * What the two engines allowed before the budgets were configurable: enough
 * for the built-in converter to rasterise a long document, and diagrams that
 * never hold an export open for long.
 */
export const defaultExportTimeouts: ExportTimeouts = {
    documentMs: 120000,
    diagramMs: 20000
};

/** Settings hold seconds; every consumer of them works in milliseconds. */
function getTimeoutMs(key: string, fallbackMs: number, resource?: vscode.Uri): number {
    const configured = vscode.workspace.getConfiguration('prettyMarkdown', resource).get<number>(key);

    return typeof configured === 'number' && Number.isFinite(configured) && configured >= 0
        ? Math.round(configured * 1000)
        : fallbackMs;
}

/** The timeouts an export of `resource` runs under. */
export function getExportTimeouts(resource?: vscode.Uri): ExportTimeouts {
    return {
        documentMs: getTimeoutMs('exportTimeout', defaultExportTimeouts.documentMs, resource),
        diagramMs: getTimeoutMs('diagramTimeout', defaultExportTimeouts.diagramMs, resource)
    };
}
