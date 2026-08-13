import * as vscode from 'vscode';

/**
 * Colours for every themeable component. The same resolved set drives the
 * preview, both PDF export paths and the web build, so a document looks the
 * same wherever it is rendered.
 */
export interface ThemeTokens {
    background: string;
    text: string;
    heading: string;
    headingRule: string;
    link: string;
    linkHover: string;
    inlineCodeBackground: string;
    inlineCodeText: string;
    codeBackground: string;
    codeText: string;
    codeBorder: string;
    blockquoteBackground: string;
    blockquoteBorder: string;
    blockquoteText: string;
    tableBackground: string;
    tableHeaderBackground: string;
    tableRowAlternate: string;
    tableBorder: string;
    horizontalRule: string;
    diagramBackground: string;
    syntaxKeyword: string;
    syntaxString: string;
    syntaxComment: string;
    syntaxNumber: string;
    syntaxBuiltIn: string;
    syntaxVariable: string;
    syntaxTitle: string;
    syntaxAttribute: string;
    syntaxLiteral: string;
    syntaxFunction: string;
    syntaxPunctuation: string;
}

export type ThemeName = 'default' | 'github' | 'dark' | 'sepia';

/**
 * What each preset is called in the UI. The setting values are kept as they
 * were so existing settings.json files keep working.
 */
export const themeLabels: { [name in ThemeName]: string } = {
    default: 'Pretty Light',
    github: 'GitHub',
    dark: 'Pretty Dark',
    sepia: 'Sepia'
};

/** The look the extension has always shipped; the baseline every theme extends. */
const defaultTheme: ThemeTokens = {
    background: '#ffffff',
    text: '#1a1a1a',
    heading: '#000000',
    headingRule: '#cccccc',
    link: '#333333',
    linkHover: '#000000',
    inlineCodeBackground: '#f5f7f9',
    inlineCodeText: '#aa0000',
    codeBackground: '#f5f7f9',
    codeText: '#1a1a1a',
    codeBorder: '#d0d8e0',
    blockquoteBackground: '#f9f9f9',
    blockquoteBorder: '#666666',
    blockquoteText: '#555555',
    tableBackground: '#ffffff',
    tableHeaderBackground: '#f5f5f5',
    tableRowAlternate: '#fafafa',
    tableBorder: '#cccccc',
    horizontalRule: '#cccccc',
    diagramBackground: '#ffffff',
    syntaxKeyword: '#f19130',
    syntaxString: '#569cd6',
    syntaxComment: '#555555',
    syntaxNumber: '#ce9178',
    syntaxBuiltIn: '#ff3dff',
    syntaxVariable: '#5555ff',
    syntaxTitle: '#ff5555',
    syntaxAttribute: '#00aaaa',
    syntaxLiteral: '#ff3dff',
    syntaxFunction: '#5555ff',
    syntaxPunctuation: '#aaaaaa'
};

const githubTheme: ThemeTokens = {
    ...defaultTheme,
    text: '#1f2328',
    heading: '#1f2328',
    headingRule: '#d1d9e0',
    link: '#0969da',
    linkHover: '#0550ae',
    inlineCodeBackground: '#eff1f3',
    inlineCodeText: '#1f2328',
    codeBackground: '#f6f8fa',
    codeText: '#1f2328',
    codeBorder: '#d1d9e0',
    blockquoteBackground: '#ffffff',
    blockquoteBorder: '#d1d9e0',
    blockquoteText: '#59636e',
    tableHeaderBackground: '#f6f8fa',
    tableRowAlternate: '#f6f8fa',
    tableBorder: '#d1d9e0',
    horizontalRule: '#d1d9e0',
    syntaxKeyword: '#cf222e',
    syntaxString: '#0a3069',
    syntaxComment: '#59636e',
    syntaxNumber: '#0550ae',
    syntaxBuiltIn: '#8250df',
    syntaxVariable: '#953800',
    syntaxTitle: '#8250df',
    syntaxAttribute: '#0550ae',
    syntaxLiteral: '#0550ae',
    syntaxFunction: '#8250df',
    syntaxPunctuation: '#59636e'
};

const darkTheme: ThemeTokens = {
    background: '#1e1e1e',
    text: '#d4d4d4',
    heading: '#ffffff',
    headingRule: '#3c3c3c',
    link: '#4daafc',
    linkHover: '#8ac4ff',
    inlineCodeBackground: '#2a2a2a',
    inlineCodeText: '#ce9178',
    codeBackground: '#252526',
    codeText: '#d4d4d4',
    codeBorder: '#3c3c3c',
    blockquoteBackground: '#252526',
    blockquoteBorder: '#569cd6',
    blockquoteText: '#b0b0b0',
    tableBackground: '#1e1e1e',
    tableHeaderBackground: '#2d2d2d',
    tableRowAlternate: '#252526',
    tableBorder: '#3c3c3c',
    horizontalRule: '#3c3c3c',
    diagramBackground: '#1e1e1e',
    syntaxKeyword: '#569cd6',
    syntaxString: '#ce9178',
    syntaxComment: '#6a9955',
    syntaxNumber: '#b5cea8',
    syntaxBuiltIn: '#4ec9b0',
    syntaxVariable: '#9cdcfe',
    syntaxTitle: '#dcdcaa',
    syntaxAttribute: '#9cdcfe',
    syntaxLiteral: '#569cd6',
    syntaxFunction: '#dcdcaa',
    syntaxPunctuation: '#808080'
};

const sepiaTheme: ThemeTokens = {
    ...defaultTheme,
    background: '#faf4e8',
    text: '#3b3128',
    heading: '#2b2119',
    headingRule: '#ddd0b8',
    link: '#8a5a2b',
    linkHover: '#5c3a17',
    inlineCodeBackground: '#f2e8d5',
    inlineCodeText: '#8a3324',
    codeBackground: '#f2e8d5',
    codeText: '#3b3128',
    codeBorder: '#ddd0b8',
    blockquoteBackground: '#f4ecdc',
    blockquoteBorder: '#c2a878',
    blockquoteText: '#5c5044',
    tableBackground: '#faf4e8',
    tableHeaderBackground: '#f2e8d5',
    tableRowAlternate: '#f6eeda',
    tableBorder: '#ddd0b8',
    horizontalRule: '#ddd0b8',
    diagramBackground: '#faf4e8'
};

const themes: { [name in ThemeName]: ThemeTokens } = {
    default: defaultTheme,
    github: githubTheme,
    dark: darkTheme,
    sepia: sepiaTheme
};

/** Every token name, used to validate override keys and drive the settings UI. */
export const themeTokenNames = Object.keys(defaultTheme) as Array<keyof ThemeTokens>;

/**
 * A CSS colour this extension is willing to inline into a stylesheet.
 *
 * Overrides come from settings, which are plain text, so anything not matching
 * is dropped rather than pasted into the page.
 */
const colorPattern = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%/]+\)|hsla?\([\d\s.,%/deg]+\)|[a-z]+)$/i;

export function isValidColor(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0 && colorPattern.test(value.trim());
}

/**
 * Resolve the theme for a document: the chosen preset, with any per-component
 * overrides applied on top.
 */
export function resolveTheme(resource?: vscode.Uri): ThemeTokens {
    const configuration = vscode.workspace.getConfiguration('prettyMarkdown', resource);
    const name = configuration.get<ThemeName>('theme', 'default');
    const base = themes[name] || defaultTheme;
    const overrides = configuration.get<{ [key: string]: unknown }>('colors', {}) || {};

    const resolved: ThemeTokens = { ...base };
    for (const token of themeTokenNames) {
        const override = overrides[token];
        if (isValidColor(override)) {
            resolved[token] = override.trim();
        }
    }

    return resolved;
}

export function getThemeTokens(name: ThemeName): ThemeTokens {
    return { ...(themes[name] || defaultTheme) };
}

/** The CSS custom properties every stylesheet in the extension reads. */
export function getThemeCssVariables(theme: ThemeTokens): string {
    return themeTokenNames
        .map(token => `            --pm-${toKebabCase(token)}: ${theme[token]};`)
        .join('\n');
}

function toKebabCase(value: string): string {
    return value.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);
}

/**
 * Is the background dark enough that diagrams and other generated content
 * should switch to their dark variants?
 */
export function isDarkTheme(theme: ThemeTokens): boolean {
    const hex = theme.background.trim().replace('#', '');
    if (!/^[0-9a-f]{3,8}$/i.test(hex)) {
        return false;
    }

    const expanded = hex.length === 3
        ? hex.split('').map(character => character + character).join('')
        : hex.slice(0, 6);

    const red = parseInt(expanded.slice(0, 2), 16);
    const green = parseInt(expanded.slice(2, 4), 16);
    const blue = parseInt(expanded.slice(4, 6), 16);

    // Rec. 601 luma; good enough to pick between a light and dark variant.
    return (0.299 * red + 0.587 * green + 0.114 * blue) < 128;
}

/**
 * Mermaid draws its own SVG, so it needs the palette handed to it separately.
 * Uses mermaid's 'base' theme, which exists to be overridden like this.
 *
 * Every surface is pinned, not just the three base colours. Mermaid derives
 * the rest by lightening and darkening those, and on a dark palette the
 * derived shades drift apart: clusters, notes and actors each ended up a
 * different grey, and edge labels kept the light default.
 */
export function getMermaidThemeVariables(theme: ThemeTokens): { [key: string]: string } {
    const canvas = theme.diagramBackground;
    const surface = theme.tableHeaderBackground;
    const panel = theme.blockquoteBackground;
    const border = theme.tableBorder;
    const text = theme.text;

    return {
        background: canvas,

        primaryColor: surface,
        primaryTextColor: text,
        primaryBorderColor: border,
        secondaryColor: panel,
        secondaryTextColor: text,
        secondaryBorderColor: border,
        tertiaryColor: theme.inlineCodeBackground,
        tertiaryTextColor: text,
        tertiaryBorderColor: border,

        mainBkg: surface,
        nodeBorder: border,
        nodeTextColor: text,
        lineColor: theme.blockquoteText,
        textColor: text,
        titleColor: theme.heading,
        altBackground: panel,

        clusterBkg: panel,
        clusterBorder: border,

        edgeLabelBackground: canvas,
        labelBackground: canvas,
        labelTextColor: text,
        labelBoxBkgColor: surface,
        labelBoxBorderColor: border,

        noteBkgColor: panel,
        noteTextColor: text,
        noteBorderColor: border,

        actorBkg: surface,
        actorBorder: border,
        actorTextColor: text,
        actorLineColor: theme.blockquoteText,
        signalColor: theme.blockquoteText,
        signalTextColor: text,
        activationBkgColor: panel,
        activationBorderColor: border,
        // Drawn inside a disc filled with lineColor, so it takes the canvas.
        sequenceNumberColor: canvas,
        loopTextColor: text,

        sectionBkgColor: canvas,
        sectionBkgColor2: canvas,
        altSectionBkgColor: panel,
        gridColor: border,
        taskBkgColor: surface,
        taskBorderColor: border,
        taskTextColor: text,
        taskTextLightColor: text,
        taskTextDarkColor: text,
        taskTextOutsideColor: text,
        activeTaskBkgColor: panel,
        activeTaskBorderColor: theme.link,
        doneTaskBkgColor: canvas,
        doneTaskBorderColor: border,

        attributeBackgroundColorOdd: surface,
        attributeBackgroundColorEven: panel
    };
}
