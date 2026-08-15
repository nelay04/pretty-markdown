/**
 * Print layout is paginated, the preview is not, so a block that is taller than
 * the space left on the page has nowhere to go: the browser moves it to the
 * next page and leaves the rest of the current one blank. A full-page mermaid
 * diagram therefore costs a page-sized gap before it and, because it still does
 * not fit, spills onto a further page.
 *
 * Both PDF paths run this pass just before printing, once diagrams have been
 * drawn and their real heights are known.
 */

/** Values of the `prettyMarkdown.oversizedDiagrams` setting. */
export type OversizedBlockSetting = 'ask' | 'keepWhole' | 'split';

/** What to do with a diagram or image that cannot share a page. */
export type OversizedBlockPolicy =
    /** Scale it so it prints whole on one page, accepting the gap before it. */
    | 'fit'
    /** Let it run across the page break, so no space is wasted. */
    | 'split';

export interface PrintFitOptions {
    /** Paper the PDF is printed on; both exporters use A4. */
    pageWidthMm?: number;
    pageHeightMm?: number;
    /** Page margins applied by the exporter. */
    marginSideMm?: number;
    marginBlockMm?: number;
    /** Element that is scaled to fill the printable width. */
    rootSelector?: string;
    /** How oversized diagrams and images are handled. Defaults to 'fit'. */
    policy?: OversizedBlockPolicy;
    /**
     * How far a diagram or image may be scaled down to make it fit a page.
     * Past this it is printed across pages instead: a drawing squeezed to a
     * fraction of its size is unreadable, which is worse than a split one.
     */
    minScale?: number;
    /**
     * Blank space, as a share of a page, that counts as a gap worth reporting
     * back to the caller.
     */
    significantGapRatio?: number;
}

/** A block that is about to leave a page mostly blank in front of itself. */
export interface PrintGap {
    /** How much of the page is left blank, in CSS pixels. */
    gapPx: number;
    /** The same, as a share of the printable page height. */
    gapRatio: number;
    /** Whether the block was split across pages rather than kept whole. */
    split: boolean;
}

export interface PrintFitResult {
    gaps: PrintGap[];
}

/** The policy a setting asks for, before the user is given the choice. */
export function policyOf(setting: OversizedBlockSetting): OversizedBlockPolicy {
    return setting === 'split' ? 'split' : 'fit';
}

/**
 * Script body that opens every collapsed `<details>` section.
 *
 * A closed section prints as nothing but its summary line, so the content a
 * reader folded away in the preview would be missing from their PDF. Run
 * before the fit pass below, which measures the heights that result.
 */
export function getPrintExpandScript(): string {
    return `
        (function () {
            document.querySelectorAll('details:not([open])').forEach(function (section) {
                section.open = true;
                section.setAttribute('data-pretty-print-expanded', '');
            });
        })();
    `;
}

/**
 * Script body that makes oversized blocks fit the printed page, evaluating to
 * a {@link PrintFitResult}.
 *
 * Sizes are worked out from the root element's own width rather than assumed:
 * Chrome lays the page out at the printable width, while html2pdf rasterises
 * the on-screen width and scales the result, and this ratio covers both.
 */
export function getPrintFitScript(options: PrintFitOptions = {}): string {
    const pageWidthMm = options.pageWidthMm ?? 210;
    const pageHeightMm = options.pageHeightMm ?? 297;
    const marginSideMm = options.marginSideMm ?? 10;
    const marginBlockMm = options.marginBlockMm ?? 10;
    const rootSelector = options.rootSelector ?? 'body';
    const policy = options.policy ?? 'fit';
    const minScale = options.minScale ?? 0.5;
    const significantGapRatio = options.significantGapRatio ?? 0.25;

    return `
        (function () {
            const empty = { gaps: [] };
            const root = document.querySelector(${JSON.stringify(rootSelector)}) || document.body;
            if (!root) {
                return empty;
            }

            const printableWidthMm = ${pageWidthMm} - 2 * ${marginSideMm};
            const printableHeightMm = ${pageHeightMm} - 2 * ${marginBlockMm};
            const rootWidth = root.getBoundingClientRect().width;
            if (!rootWidth || printableWidthMm <= 0) {
                return empty;
            }

            const rootStyle = getComputedStyle(root);
            // Content wider than the paper makes the printer shrink the whole
            // page to fit, so a page then holds more than its width suggests.
            // Everything below is measured in that laid-out width.
            const layoutWidth = Math.max(rootWidth, root.scrollWidth);
            const pxPerMm = layoutWidth / printableWidthMm;
            // What is left of a page once the root's own padding is taken off,
            // in the same pixels every measurement below is made in.
            const usableHeight = printableHeightMm * pxPerMm -
                parseFloat(rootStyle.paddingTop) - parseFloat(rootStyle.paddingBottom);
            if (!(usableHeight > 0)) {
                return empty;
            }

            // Styles from an earlier run would be measured as if they were the
            // document's own, so a second pass starts from a clean layout.
            root.querySelectorAll('[data-pretty-print-slice]').forEach((holder) => {
                if (holder.prettyPrintOriginal && holder.parentNode) {
                    holder.parentNode.replaceChild(holder.prettyPrintOriginal, holder);
                }
            });
            root.querySelectorAll('[data-pretty-print-fit]').forEach((element) => {
                element.style.maxHeight = '';
                element.style.height = '';
                element.style.width = '';
                element.style.breakInside = '';
                element.style.pageBreakInside = '';
                element.removeAttribute('data-pretty-print-fit');
            });

            const isHeading = (element) => /^H[1-6]$/.test(element.tagName);
            const isPrintable = (element) => !/^(SCRIPT|STYLE|LINK|TEMPLATE)$/.test(element.tagName);

            /**
             * The document as the printer sees it: each block, together with
             * the headings above it, which carry page-break-after: avoid and
             * therefore travel to the next page with the block.
             */
            const groups = [];
            let heldHeadings = [];
            Array.from(root.children).filter(isPrintable).forEach((element) => {
                if (isHeading(element)) {
                    heldHeadings.push(element);
                    return;
                }
                groups.push({ block: element, top: (heldHeadings[0] || element).getBoundingClientRect().top });
                heldHeadings = [];
            });
            if (heldHeadings.length > 0) {
                const last = heldHeadings[heldHeadings.length - 1];
                groups.push({ block: last, top: heldHeadings[0].getBoundingClientRect().top });
            }

            // A picture cannot be broken in half by the printer: it either
            // moves to the next page whole, or is painted across the break.
            const pictureOf = (block) => {
                if (block.matches('pre.mermaid')) {
                    return block.querySelector('svg');
                }
                if (block.matches('img')) {
                    return block;
                }
                return block.querySelector('pre.mermaid svg, img');
            };

            /**
             * Print a picture across page breaks by showing a different band
             * of it on each page. A drawing is a single object as far as the
             * printer is concerned — it can only be moved, never broken — so
             * the cut has to be made here, in the document.
             */
            const sliceAcrossPages = (block, picture, firstHeight) => {
                const total = picture.getBoundingClientRect().height;
                // A sliver of a drawing at the foot of a page reads as an
                // accident rather than a diagram continuing overleaf.
                if (firstHeight < 60 || total <= firstHeight) {
                    return false;
                }

                const holder = document.createElement('div');
                holder.setAttribute('data-pretty-print-slice', '');
                holder.prettyPrintOriginal = picture;

                for (let shown = 0, height = firstHeight; shown < total; height = usableHeight - 2) {
                    const band = Math.min(height, total - shown);
                    const window_ = document.createElement('div');
                    window_.style.overflow = 'hidden';
                    window_.style.height = band + 'px';
                    if (shown > 0) {
                        window_.style.breakBefore = 'page';
                        window_.style.pageBreakBefore = 'always';
                    }

                    const band_ = picture.cloneNode(true);
                    band_.style.display = 'block';
                    band_.style.marginTop = (-shown) + 'px';
                    window_.appendChild(band_);
                    holder.appendChild(window_);
                    shown += band;
                }

                picture.parentNode.replaceChild(holder, picture);
                block.style.breakInside = 'auto';
                block.style.pageBreakInside = 'auto';
                block.setAttribute('data-pretty-print-fit', '');
                return true;
            };

            const contentTop = root.getBoundingClientRect().top + parseFloat(rootStyle.paddingTop);
            const gaps = [];
            let shift = 0;

            groups.forEach((group) => {
                const block = group.block;
                const top = group.top - contentTop + shift;
                const bottom = block.getBoundingClientRect().bottom - contentTop + shift;
                const pageEnd = (Math.floor(top / usableHeight) + 1) * usableHeight;
                if (bottom <= pageEnd) {
                    return;
                }

                const picture = pictureOf(block);
                const keepsWhole = picture !== null ||
                    getComputedStyle(block).breakInside === 'avoid';
                if (!keepsWhole) {
                    // Text simply flows over the break.
                    return;
                }

                // Everything after a block that jumps to the next page moves
                // down with it, which is what decides where the next one lands.
                const gap = pageEnd - top;
                const height = bottom - top;

                if (!picture) {
                    // A code block or table that is taller than a whole page
                    // cannot be helped by moving it; let it break instead.
                    if (height > usableHeight) {
                        block.style.breakInside = 'auto';
                        block.style.pageBreakInside = 'auto';
                        block.setAttribute('data-pretty-print-fit', '');
                        return;
                    }
                    shift += gap;
                    return;
                }

                const pictureHeight = picture.getBoundingClientRect().height;
                // What the headings printed with it and the block's own
                // padding leave for the picture itself.
                const chrome = height - pictureHeight;
                const budget = usableHeight - chrome;
                const gapRatio = gap / usableHeight;
                const wanted = ${policy === 'split'} && gapRatio >= ${significantGapRatio};
                // Fitting is pointless past the readable minimum, so a picture
                // that would have to shrink further is cut instead.
                const canFit = !wanted && budget >= pictureHeight * ${minScale};

                // Two pixels of slack keep a band that rounds up from
                // spilling onto the next page and blanking this one.
                if (!canFit && sliceAcrossPages(block, picture, gap - chrome - 2)) {
                    gaps.push({ gapPx: gap, gapRatio: gapRatio, split: true });
                    return;
                }

                // Kept whole: it starts on the next page, and the space it
                // could not fill is left blank.
                // The extra pixel keeps a rounded-up layout height from
                // tipping the block over the page boundary again.
                picture.style.maxHeight = (Math.min(budget, pictureHeight) - 1) + 'px';
                picture.style.height = 'auto';
                picture.style.width = 'auto';
                picture.setAttribute('data-pretty-print-fit', '');
                gaps.push({ gapPx: gap, gapRatio: gapRatio, split: false });
                shift += gap;
            });

            return { gaps: gaps };
        })()
    `;
}
