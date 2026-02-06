import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';
import { escapeHtml } from '../utils/helpers';

/**
 * Render markdown content to HTML with syntax highlighting
 */
export function renderMarkdown(markdown: string): string {
    const md = new MarkdownIt({
        html: true,
        linkify: true,
        typographer: true,
        highlight: (str: string, lang: string) => {
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

    return md.render(markdown);
}
