/**
 * Generate complete HTML content for webview preview
 */
export function getWebviewContent(content: string, title: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        /* Pretty Markdown Color Palette */
        :root {
            --pretty-black: #000000;
            --pretty-dark-blue: #0000AA;
            --pretty-dark-green: #007c2b;
            --pretty-dark-cyan: #00AAAA;
            --pretty-dark-red: #AA0000;
            --pretty-dark-magenta: #AA00AA;
            --pretty-brown: #AA5500;
            --pretty-light-gray: #AAAAAA;
            --pretty-dark-gray: #555555;
            --pretty-blue: #5555FF;
            --pretty-green: #569cd6;
            --pretty-cyan: #ce9178;
            --pretty-red: #FF5555;
            --pretty-magenta: #ff3dff;
            --pretty-yellow: #f19130;
            --pretty-white: #FFFFFF;
        }
        
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
            line-height: 1.5;
            color: #1a1a1a;
            background: #ffffff;
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
            color: #000000;
        }
        
        h1 {
            font-size: 1.75em;
            border-bottom: 1px solid #cccccc;
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
            color: #333333;
            text-decoration: none;
            border-bottom: 1px solid #999999;
        }
        
        a:hover {
            color: #000000;
            border-bottom: 1px solid #333333;
        }
        
        /* Inline code */
        code {
            background: #f5f7f9;
            padding: 2px 4px;
            border-radius: 2px;
            font-family: 'Consolas', 'Courier New', monospace;
            font-size: 0.85em;
            color: var(--pretty-dark-red);
        }
        
        /* Code blocks */
        pre {
            background: #f5f7f9;
            color: #1a1a1a;
            padding: 12px;
            border-radius: 3px;
            overflow-x: auto;
            margin: 12px 0;
            border: 1px solid #d0d8e0;
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
        .hljs-keyword { color: var(--pretty-yellow); }
        .hljs-string { color: var(--pretty-green); }
        .hljs-comment { color: var(--pretty-dark-gray); }
        .hljs-number { color: var(--pretty-cyan); }
        .hljs-built_in { color: var(--pretty-magenta); }
        .hljs-variable { color: var(--pretty-blue); }
        .hljs-title { color: var(--pretty-red); }
        .hljs-attr { color: var(--pretty-dark-cyan); }
        .hljs-selector-tag { color: var(--pretty-yellow); }
        .hljs-selector-id { color: var(--pretty-green); }
        .hljs-selector-class { color: var(--pretty-cyan); }
        .hljs-literal { color: var(--pretty-magenta); }
        .hljs-function { color: var(--pretty-blue); }
        .hljs-punctuation { color: var(--pretty-light-gray); }
        
        /* Blockquotes */
        blockquote {
            border-left: 3px solid #666666;
            padding-left: 12px;
            margin: 12px 0;
            color: #555555;
            font-style: italic;
            background: #f9f9f9;
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
            background: #ffffff;
            border: 1px solid #cccccc;
            font-size: 0.9em;
        }
        
        th, td {
            border: 1px solid #cccccc;
            padding: 6px 8px;
            text-align: left;
        }
        
        th {
            background: #f5f5f5;
            font-weight: 500;
            color: #000000;
        }
        
        tr:nth-child(even) {
            background: #fafafa;
        }
        
        /* Images */
        img {
            max-width: 100%;
            height: auto;
            margin: 12px 0;
        }
        
        /* Horizontal rule */
        hr {
            border: none;
            border-top: 1px solid #cccccc;
            margin: 16px 0;
        }
        
        /* Compact spacing adjustments */
        h1 + p, h2 + p, h3 + p, h4 + p, h5 + p, h6 + p {
            margin-top: 4px;
        }
        
        /* Print styles for clean PDF export */
        @media print {
            body {
                padding: 5mm;
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
        }
    </style>
</head>
<body>
    ${content}
</body>
</html>`;
}
