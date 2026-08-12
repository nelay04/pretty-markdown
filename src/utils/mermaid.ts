/**
 * Mermaid is rendered in the browser, so every target (preview webview, the
 * html2pdf fallback webview, and the Chrome page used for PDF export) runs the
 * same boot script. Each target only differs in how it loads the library and
 * how it learns that rendering has finished.
 */

/** Set on window once every diagram has been drawn, or drawing has failed. */
export const mermaidReadyFlag = '__prettyMarkdownMermaidReady';

/**
 * Script body that renders every `<pre class="mermaid">` on the page.
 *
 * Diagrams that fail to parse are left as their source text rather than
 * aborting the whole run, so one bad diagram cannot lose the document.
 */
export interface MermaidThemeOptions {
    /** Passed to mermaid's 'base' theme; see getMermaidThemeVariables(). */
    variables?: { [key: string]: string };
}

export function getMermaidBootScript(options: MermaidThemeOptions = {}): string {
    return `
        (function () {
            // Only unrendered blocks. Rasterisers such as html2canvas clone the
            // document, and a cloned <script> runs again in the clone; without
            // this guard the second pass would feed mermaid the text of the
            // SVG it just produced and draw an error diagram.
            const blocks = Array.from(document.querySelectorAll('pre.mermaid:not([data-processed])'));
            if (blocks.length === 0 || typeof mermaid === 'undefined') {
                window.${mermaidReadyFlag} = true;
                return;
            }

            mermaid.initialize({
                startOnLoad: false,
                theme: ${options.variables ? "'base'" : "'default'"},
                ${options.variables ? `themeVariables: ${JSON.stringify(options.variables)},` : ''}
                securityLevel: 'strict',
                // Never inject the "Syntax error" graphic into the page; a bad
                // diagram keeps its source text instead.
                suppressErrorRendering: true,
                fontFamily: "'Segoe UI', -apple-system, BlinkMacSystemFont, system-ui, sans-serif"
            });

            let pending = blocks.length;
            const done = () => {
                pending -= 1;
                if (pending <= 0) {
                    document.querySelectorAll('[id^="dpretty-mermaid-"], .mermaidTooltip')
                        .forEach((leftover) => leftover.remove());
                    window.${mermaidReadyFlag} = true;
                }
            };

            const fail = (block, error) => {
                block.setAttribute('data-mermaid-error', String(error && error.message || error).slice(0, 200));
                done();
            };

            blocks.forEach((block, index) => {
                const source = block.textContent || '';
                const id = 'pretty-mermaid-' + index;
                // Stashed so a later pass can put the source back if mermaid
                // replaces the block with its error graphic.
                block.setAttribute('data-mermaid-source', source);

                // parse() reports invalid diagrams without throwing, and
                // without the side effects render() has.
                Promise.resolve(mermaid.parse(source, { suppressErrors: true }))
                    .then((parsed) => {
                        if (parsed === false) {
                            fail(block, 'Invalid mermaid syntax');
                            return;
                        }

                        return mermaid.render(id, source).then((result) => {
                            if (!result || !result.svg) {
                                fail(block, 'Diagram could not be drawn');
                                return;
                            }

                            block.innerHTML = result.svg;

                            // parse() accepts some diagrams that only fail while
                            // being drawn, and render() then resolves with
                            // mermaid's error graphic instead of rejecting.
                            // Inspect the parsed DOM, which normalises however
                            // the SVG happened to be serialised.
                            const svg = block.querySelector('svg');
                            if (!svg || svg.getAttribute('aria-roledescription') === 'error') {
                                block.textContent = source;
                                fail(block, 'Diagram could not be drawn');
                                return;
                            }

                            block.setAttribute('data-processed', 'true');
                            if (typeof result.bindFunctions === 'function') {
                                result.bindFunctions(block);
                            }
                            done();
                        });
                    })
                    .catch((error) => fail(block, error));
            });
        })();
    `;
}

/**
 * Undo any error graphic mermaid has swapped into a diagram block.
 *
 * mermaid can replace a block well after `render()` resolved, so rasterising
 * and printing run this immediately beforehand rather than trusting the state
 * left behind by the initial pass.
 */
export function getMermaidCleanupScript(): string {
    return `
        (function () {
            document.querySelectorAll('pre.mermaid').forEach(function (block) {
                if (!block.querySelector('svg[aria-roledescription="error"]')) {
                    return;
                }
                var source = block.getAttribute('data-mermaid-source');
                if (source !== null) {
                    block.textContent = source;
                }
                block.removeAttribute('data-processed');
                block.setAttribute('data-mermaid-error', 'Diagram could not be drawn');
            });

            document.querySelectorAll('svg[aria-roledescription="error"], [id^="dpretty-mermaid-"], .mermaidTooltip')
                .forEach(function (leftover) { leftover.remove(); });
        })();
    `;
}
