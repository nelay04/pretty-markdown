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
export function getMermaidBootScript(): string {
    return `
        (function () {
            const blocks = Array.from(document.querySelectorAll('pre.mermaid'));
            if (blocks.length === 0 || typeof mermaid === 'undefined') {
                window.${mermaidReadyFlag} = true;
                return;
            }

            mermaid.initialize({
                startOnLoad: false,
                theme: 'default',
                securityLevel: 'strict',
                fontFamily: "'Segoe UI', -apple-system, BlinkMacSystemFont, system-ui, sans-serif"
            });

            let pending = blocks.length;
            const done = () => {
                pending -= 1;
                if (pending <= 0) {
                    window.${mermaidReadyFlag} = true;
                }
            };

            blocks.forEach((block, index) => {
                const source = block.textContent || '';
                mermaid.render('pretty-mermaid-' + index, source)
                    .then((result) => {
                        block.innerHTML = result.svg;
                        block.setAttribute('data-processed', 'true');
                        if (typeof result.bindFunctions === 'function') {
                            result.bindFunctions(block);
                        }
                        done();
                    })
                    .catch((error) => {
                        block.setAttribute('data-mermaid-error', String(error && error.message || error));
                        done();
                    });
            });
        })();
    `;
}
