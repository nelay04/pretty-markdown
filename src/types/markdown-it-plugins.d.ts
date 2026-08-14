/**
 * Ambient types for the markdown-it plugins that ship none of their own.
 * Only the options this project passes are declared.
 */

declare module 'markdown-it-task-lists' {
    import type MarkdownIt from 'markdown-it';

    interface TaskListOptions {
        /** Leave the checkboxes clickable. */
        enabled?: boolean;
        /** Wrap the item text in a <label>, so the text toggles the box. */
        label?: boolean;
        labelAfter?: boolean;
    }

    const taskLists: MarkdownIt.PluginWithOptions<TaskListOptions>;
    export default taskLists;
}

declare module 'markdown-it-footnote' {
    import type MarkdownIt from 'markdown-it';
    const footnote: MarkdownIt.PluginSimple;
    export default footnote;
}

declare module 'markdown-it-mark' {
    import type MarkdownIt from 'markdown-it';
    const mark: MarkdownIt.PluginSimple;
    export default mark;
}

declare module 'markdown-it-sub' {
    import type MarkdownIt from 'markdown-it';
    const sub: MarkdownIt.PluginSimple;
    export default sub;
}

declare module 'markdown-it-sup' {
    import type MarkdownIt from 'markdown-it';
    const sup: MarkdownIt.PluginSimple;
    export default sup;
}
