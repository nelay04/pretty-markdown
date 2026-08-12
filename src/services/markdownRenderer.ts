import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';
import { escapeHtml } from '../utils/helpers';

export interface RenderOptions {
    /**
     * Rewrites a relative image path into something the render target can
     * load: a webview URI for the preview, a file:// URL for the PDF export.
     * Absolute and remote sources are passed through untouched.
     */
    resolveImage?: (src: string) => string;
}

/** Fenced blocks tagged with one of these become diagrams instead of code. */
const mermaidLanguages = new Set(['mermaid', 'mmd']);

function isExternalSource(src: string): boolean {
    return /^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith('//') || src.startsWith('#');
}

/**
 * Render markdown content to HTML with syntax highlighting and mermaid support
 */
export function renderMarkdown(markdown: string, options: RenderOptions = {}): string {
    const md = new MarkdownIt({
        html: true,
        linkify: true,
        typographer: true,
        highlight: (str: string, lang: string) => {
            // Mermaid blocks must reach the browser as source text; the
            // diagram is drawn client-side once mermaid runs.
            if (lang && mermaidLanguages.has(lang.toLowerCase())) {
                return `<pre class="mermaid">${escapeHtml(str)}</pre>`;
            }

            if (lang && hljs.getLanguage(lang)) {
                try {
                    return `<pre class="hljs"><code>${hljs.highlight(str, { language: lang }).value}</code></pre>`;
                } catch (e) {
                    console.error(e);
                }
            }
            return `<pre class="hljs"><code>${escapeHtml(str)}</code></pre>`;
        }
    });

    if (options.resolveImage) {
        const resolveImage = options.resolveImage;
        const defaultImageRule = md.renderer.rules.image;

        md.renderer.rules.image = (tokens, idx, rendererOptions, env, self) => {
            const token = tokens[idx];
            const srcIndex = token.attrIndex('src');

            if (srcIndex >= 0 && token.attrs) {
                const src = token.attrs[srcIndex][1];
                if (!isExternalSource(src)) {
                    token.attrs[srcIndex][1] = resolveImage(src);
                }
            }

            return defaultImageRule
                ? defaultImageRule(tokens, idx, rendererOptions, env, self)
                : self.renderToken(tokens, idx, rendererOptions);
        };
    }

    // HTML image tags written directly in the markdown bypass the image rule.
    const html = md.render(markdown);
    if (!options.resolveImage) {
        return html;
    }

    const resolveImage = options.resolveImage;
    return html.replace(/(<img\b[^>]*?\bsrc=)(["'])(.*?)\2/gi, (match, prefix, quote, src) => {
        return isExternalSource(src) ? match : `${prefix}${quote}${resolveImage(src)}${quote}`;
    });
}

/**
 * Whether the rendered HTML contains diagrams that need mermaid loaded.
 */
export function containsMermaid(html: string): boolean {
    return html.includes('<pre class="mermaid">');
}
