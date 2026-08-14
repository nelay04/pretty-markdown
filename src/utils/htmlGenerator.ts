import { ThemeTokens, getThemeCssVariables, getThemeTokens } from '../services/themeManager';

export interface WebviewContentOptions {
    /** Injected verbatim into <head>, e.g. a Content-Security-Policy meta tag. */
    head?: string;
    /** Injected just before </body>, e.g. mermaid or link handling scripts. */
    scripts?: string;
    /** Component colours. Falls back to the built-in palette when omitted. */
    theme?: ThemeTokens;
}

/**
 * Generate complete HTML content for webview preview
 */
export function getWebviewContent(content: string, title: string, options: WebviewContentOptions = {}): string {
    const theme = options.theme || getThemeTokens('default');

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>${options.head ? `\n    ${options.head}` : ''}
    <style>
        /* Component colours, resolved from the prettyMarkdown.theme setting */
        :root {
${getThemeCssVariables(theme)}
        }
        
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
            line-height: 1.5;
            color: var(--pm-text);
            background: var(--pm-background);
            padding: 20px;
            max-width: 800px;
            margin: 0 auto;
            font-size: 14px;
        }
        
        /* Headings - Monochromatic */
        h1, h2,h3,h4,h5,h6 {
            margin: 16px 0 8px;
            font-weight: 500;
            line-height: 1.3;
            color: var(--pm-heading);
        }
        
        h1 {
            font-size: 1.75em;
            border-bottom: 1px solid var(--pm-heading-rule);
            padding-bottom: 6px;
            margin-bottom: 16px;
        }
        
        h2 {
            font-size: 1.5em;
        }
        
        h3 { 
            font-size: 1.25em;
        }
        
        h4 { 
            font-size: 1.1em;
        }
        
        h5, h6 {
            font-size: 1em;
        }
        
        /* Text elements */
        p {
            margin: 8px 0;
            text-align: left;
        }
        
        a {
            color: var(--pm-link);
            text-decoration: none;
            border-bottom: 1px solid var(--pm-link);
        }
        
        a:hover {
            color: var(--pm-link-hover);
            border-bottom: 1px solid var(--pm-link-hover);
        }
        
        /* Inline code */
        code {
            background: var(--pm-inline-code-background);
            padding: 2px 4px;
            border-radius: 2px;
            font-family: 'Consolas', 'Courier New', monospace;
            font-size: 0.85em;
            color: var(--pm-inline-code-text);
        }
        
        /* Code blocks */
        pre {
            background: var(--pm-code-background);
            color: var(--pm-code-text);
            padding: 12px;
            border-radius: 3px;
            overflow-x: auto;
            margin: 12px 0;
            border: 1px solid var(--pm-code-border);
            font-size: 0.85em;
            line-height: 1.4;
        }
        
        pre code {
            background: transparent;
            padding: 0;
            color: inherit;
            border: none;
        }
        
        /* Syntax highlighting with Pretty Markdown colors */
        .hljs-keyword { color: var(--pm-syntax-keyword); }
        .hljs-string { color: var(--pm-syntax-string); }
        .hljs-comment { color: var(--pm-syntax-comment); }
        .hljs-number { color: var(--pm-syntax-number); }
        .hljs-built_in { color: var(--pm-syntax-built-in); }
        .hljs-variable { color: var(--pm-syntax-variable); }
        .hljs-title { color: var(--pm-syntax-title); }
        .hljs-attr { color: var(--pm-syntax-attribute); }
        .hljs-selector-tag { color: var(--pm-syntax-keyword); }
        .hljs-selector-id { color: var(--pm-syntax-string); }
        .hljs-selector-class { color: var(--pm-syntax-number); }
        .hljs-literal { color: var(--pm-syntax-literal); }
        .hljs-function { color: var(--pm-syntax-function); }
        .hljs-punctuation { color: var(--pm-syntax-punctuation); }
        
        /* Blockquotes */
        blockquote {
            border-left: 3px solid var(--pm-blockquote-border);
            padding-left: 12px;
            margin: 12px 0;
            color: var(--pm-blockquote-text);
            font-style: italic;
            background: var(--pm-blockquote-background);
            padding: 8px 12px;
        }
        
        /* Lists */
        ul, ol {
            margin: 8px 0;
            padding-left: 20px;
        }
        
        li {
            margin: 4px 0;
        }
        
        /* Tables */
        table {
            border-collapse: collapse;
            width: 100%;
            margin: 12px 0;
            background: var(--pm-table-background);
            border: 1px solid var(--pm-table-border);
            font-size: 0.9em;
        }
        
        th, td {
            border: 1px solid var(--pm-table-border);
            padding: 6px 8px;
            text-align: left;
        }
        
        th {
            background: var(--pm-table-header-background);
            font-weight: 500;
            color: var(--pm-heading);
        }
        
        tr:nth-child(even) {
            background: var(--pm-table-row-alternate);
        }
        
        /* Images */
        img {
            max-width: 100%;
            height: auto;
            margin: 12px 0;
        }

        /* Mermaid diagrams */
        pre.mermaid {
            background: var(--pm-diagram-background);
            border: none;
            padding: 8px 0;
            margin: 12px 0;
            text-align: center;
            overflow-x: auto;
            page-break-inside: avoid;
        }

        pre.mermaid svg {
            max-width: 100%;
            height: auto;
        }

        /* Until mermaid has run, show the source rather than a flash of raw text */
        pre.mermaid:not([data-processed]) {
            color: var(--pm-blockquote-text);
            font-family: 'Consolas', 'Courier New', monospace;
            font-size: 0.85em;
            text-align: left;
        }
        
        /* Highlighted text */
        mark {
            background: var(--pm-mark-background);
            color: var(--pm-mark-text);
            padding: 0 2px;
            border-radius: 2px;
        }

        sub, sup {
            font-size: 0.75em;
            line-height: 0;
        }

        /* Keyboard keys */
        kbd {
            background: var(--pm-inline-code-background);
            color: var(--pm-text);
            border: 1px solid var(--pm-code-border);
            border-bottom-width: 2px;
            border-radius: 3px;
            padding: 1px 5px;
            font-family: 'Consolas', 'Courier New', monospace;
            font-size: 0.8em;
            white-space: nowrap;
        }

        /* Definition lists */
        dl {
            margin: 12px 0;
        }

        dt {
            font-weight: 600;
            color: var(--pm-heading);
            margin-top: 8px;
        }

        dd {
            margin: 2px 0 0 20px;
            color: var(--pm-blockquote-text);
        }

        /* Collapsible sections */
        details {
            border: 1px solid var(--pm-code-border);
            border-radius: 3px;
            padding: 8px 12px;
            margin: 12px 0;
            background: var(--pm-blockquote-background);
        }

        summary {
            cursor: pointer;
            font-weight: 500;
            color: var(--pm-heading);
        }

        details[open] > summary {
            margin-bottom: 8px;
            border-bottom: 1px solid var(--pm-code-border);
            padding-bottom: 6px;
        }

        /* Task lists */
        ul.contains-task-list {
            list-style: none;
            padding-left: 2px;
        }

        li.task-list-item > label {
            display: inline;
        }

        .task-list-item-checkbox {
            margin-right: 6px;
            accent-color: var(--pm-link);
            vertical-align: -1px;
        }

        /* GitHub-flavoured alerts */
        blockquote.pm-alert {
            font-style: normal;
            border-left-width: 4px;
            border-left-color: var(--pm-alert-accent);
        }

        .pm-alert-title {
            margin: 0 0 4px;
            font-weight: 600;
            color: var(--pm-alert-accent);
        }

        .pm-alert-note { --pm-alert-accent: var(--pm-alert-note); }
        .pm-alert-tip { --pm-alert-accent: var(--pm-alert-tip); }
        .pm-alert-important { --pm-alert-accent: var(--pm-alert-important); }
        .pm-alert-warning { --pm-alert-accent: var(--pm-alert-warning); }
        .pm-alert-caution { --pm-alert-accent: var(--pm-alert-caution); }

        /* Footnotes */
        .footnote-ref a {
            border-bottom: none;
            font-size: 0.85em;
        }

        .footnotes-sep {
            margin-top: 24px;
        }

        .footnotes {
            font-size: 0.9em;
            color: var(--pm-blockquote-text);
        }

        .footnotes-list {
            padding-left: 18px;
        }

        .footnote-item p {
            margin: 2px 0;
        }

        .footnote-backref {
            border-bottom: none;
            text-decoration: none;
        }

        /* Maths. katex.min.css carries the rest; these two are ours. */
        .katex {
            color: var(--pm-text);
        }

        .katex-display {
            margin: 12px 0;
            overflow-x: auto;
            overflow-y: hidden;
            padding: 2px 0;
        }

        /* Horizontal rule */
        hr {
            border: none;
            border-top: 1px solid var(--pm-horizontal-rule);
            margin: 16px 0;
        }
        
        /* Compact spacing adjustments */
        h1 + p, h2 + p, h3 + p, h4 + p, h5 + p, h6 + p {
            margin-top: 4px;
        }
        
        /* Print styles for clean PDF export */
        @media print {
            body {
                /* Side whitespace is mostly the page margin; keep the column wide. */
                padding: 5mm 2.5mm;
                font-size: 11pt;
                line-height: 1.4;
            }
            
            h1, h2, h3, h4, h5, h6 {
                margin: 12pt 0 6pt;
                page-break-after: avoid;
            }
            
            p, li {
                margin: 4pt 0;
            }
            
            pre {
                page-break-inside: avoid;
                font-size: 9pt;
            }

            details, blockquote.pm-alert, .katex-display {
                page-break-inside: avoid;
            }
        }
    </style>
</head>
<body>
    ${content}${options.scripts ? `\n${options.scripts}` : ''}
</body>
</html>`;
}
