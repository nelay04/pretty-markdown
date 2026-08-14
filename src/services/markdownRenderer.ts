import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';
import footnote from 'markdown-it-footnote';
import mark from 'markdown-it-mark';
import sub from 'markdown-it-sub';
import sup from 'markdown-it-sup';
import taskLists from 'markdown-it-task-lists';
import katex from '@vscode/markdown-it-katex';
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

/** GitHub's alert kinds, in the casing their titles are printed with. */
const alertTitles: { [kind: string]: string } = {
    note: 'Note',
    tip: 'Tip',
    important: 'Important',
    warning: 'Warning',
    caution: 'Caution'
};

function isExternalSource(src: string): boolean {
    return /^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith('//') || src.startsWith('#');
}

/**
 * Remove a YAML front matter block.
 *
 * Nothing here reads the metadata, but leaving it in is worse than dropping
 * it: `---` opens a horizontal rule and the keys below it are then parsed as a
 * Setext heading, so every document with front matter opened on a wall of
 * `title: ...` text.
 */
function stripFrontMatter(markdown: string): string {
    const match = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(markdown);
    return match ? markdown.slice(match[0].length) : markdown;
}

/**
 * Heading anchors, matching the ids GitHub generates.
 *
 * Whitespace is replaced character by character rather than run by run, which
 * is what turns "5. Code, Syntax & Diffs" into `5-code-syntax--diffs` — the
 * double dash a hand-written table of contents will be linking to.
 */
function githubSlug(title: string): string {
    return title
        .trim()
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\p{Zs}\-_]/gu, '')
        .replace(/\s/g, '-');
}

/**
 * Give every heading an id, so a hand-written table of contents and any other
 * `#section` link in the document actually go somewhere.
 *
 * Runs at the end of the core chain, where the heading's inline children are
 * available: the slug then comes from the words a reader sees, not from the
 * markup around them.
 */
function anchorsPlugin(md: MarkdownIt): void {
    md.core.ruler.push('prettyMarkdownAnchors', state => {
        const used = new Map<string, number>();

        state.tokens.forEach((token, index) => {
            if (token.type !== 'heading_open' || token.attrIndex('id') >= 0) {
                return;
            }

            const inline = state.tokens[index + 1];
            const text = inline && inline.children
                ? inline.children
                    .filter(child => child.type === 'text' || child.type === 'code_inline')
                    .map(child => child.content)
                    .join('')
                : '';

            const slug = githubSlug(text);
            if (slug.length === 0) {
                return;
            }

            // Repeated headings get -1, -2 and so on, as they do on GitHub.
            const seen = used.get(slug) ?? 0;
            used.set(slug, seen + 1);
            token.attrSet('id', seen === 0 ? slug : `${slug}-${seen}`);
        });

        return true;
    });
}

/**
 * GitHub-flavoured alerts: a blockquote whose first line is `[!NOTE]` and
 * friends becomes a titled callout.
 *
 * Runs before inline parsing, so the marker can be taken off the paragraph's
 * source text and the rest of it is parsed as if the marker had never been
 * there.
 */
function alertsPlugin(md: MarkdownIt): void {
    md.core.ruler.after('block', 'prettyMarkdownAlerts', state => {
        const tokens = state.tokens;

        for (let index = 0; index < tokens.length - 2; index++) {
            if (tokens[index].type !== 'blockquote_open' || tokens[index + 1].type !== 'paragraph_open') {
                continue;
            }

            const inline = tokens[index + 2];
            if (inline.type !== 'inline') {
                continue;
            }

            const marker = /^\[!(note|tip|important|warning|caution)\][ \t]*(?:\r?\n|$)/i.exec(inline.content);
            if (!marker) {
                continue;
            }

            const kind = marker[1].toLowerCase();
            tokens[index].attrJoin('class', `pm-alert pm-alert-${kind}`);

            const title = new state.Token('pmAlertTitle', 'p', 0);
            title.attrSet('class', 'pm-alert-title');
            title.content = alertTitles[kind];
            title.block = true;

            inline.content = inline.content.slice(marker[0].length);
            if (inline.content.length === 0) {
                // Marker-only paragraph: replace it rather than leave it empty.
                tokens.splice(index + 1, 3, title);
            } else {
                tokens.splice(index + 1, 0, title);
            }
        }

        return true;
    });

    md.renderer.rules.pmAlertTitle = (tokens, idx) =>
        `<p class="pm-alert-title">${escapeHtml(tokens[idx].content)}</p>\n`;
}

/** Renders a fenced block as a diagram, highlighted code, or plain code. */
function highlightFence(str: string, lang: string): string {
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

/**
 * The markdown-it instance every target renders with.
 *
 * Built fresh per render because `resolveImage` differs between the preview
 * and the two export paths.
 */
function createRenderer(options: RenderOptions): MarkdownIt {
    const md = new MarkdownIt({
        html: true,
        linkify: true,
        typographer: true,
        highlight: highlightFence
    })
        .use(taskLists, { enabled: false, label: true })
        .use(footnote)
        .use(mark)
        .use(sub)
        .use(sup)
        .use(anchorsPlugin)
        // A malformed equation is printed in place, in katex's error styling,
        // rather than taking the whole document down with it.
        .use(katex, { throwOnError: false, enableFencedBlocks: true })
        .use(alertsPlugin);

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

    return md;
}

/**
 * Render markdown content to HTML with syntax highlighting and mermaid support
 */
export function renderMarkdown(markdown: string, options: RenderOptions = {}): string {
    const md = createRenderer(options);
    const html = md.render(stripFrontMatter(markdown));

    if (!options.resolveImage) {
        return html;
    }

    // HTML image tags written directly in the markdown bypass the image rule.
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

/**
 * Whether the rendered HTML contains equations, and so needs katex's
 * stylesheet and fonts. They are only worth their weight when it does.
 */
export function containsMath(html: string): boolean {
    return html.includes('class="katex');
}
