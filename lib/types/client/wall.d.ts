/**
 * Shared Pinterest-style wall components for dsh-refpics, rendered by both
 * the chat toolview (keyed tool.call.toolview entry) and the sidebar board
 * tab. Fully presentational: data arrives as props, side effects (agent
 * round trips, downloads, Eagle saves) arrive as callbacks, so the same
 * tree renders in both hosts. The lightbox owns keyboard navigation and
 * its download / save-to-Eagle action state.
 *
 * @module dsh-refpics/client/wall
 */
import type { ReactNode } from 'react';
import { type RefPicsOutcome } from '../core/outcome.ts';
interface Copy {
    searching: string;
    clickHint: string;
    empty: string;
    openSource: string;
    openFull: string;
    download: string;
    saveEagle: string;
    savedEagle: string;
    savingEagle: string;
    refresh: string;
    nextPage: string;
    openBoard: string;
    search: string;
    searchPlaceholder: string;
    sent: string;
    images: string;
    close: string;
    previous: string;
    next: string;
    of: string;
    eagleUnavailable: string;
}
/** Active copy dictionary, following the shell's document language. */
export declare function copy(): Copy;
/** Skeleton masonry shown while a search runs. */
export declare const RunningWall: import("react").NamedExoticComponent<object>;
/** Header/action callbacks the wall's buttons may carry; absent = hidden. */
export interface WallActions {
    /** Disable the header buttons (a round trip is already in flight). */
    busy?: boolean;
    /** 换一批: request a fresh batch. */
    onRefresh?: () => void;
    /** 翻页: request the next page of the same query. */
    onNextPage?: () => void;
    /** Open the board tab in the sidebar. */
    onOpenBoard?: () => void;
    /** The short confirmation text after a send-triggered action. */
    sentNote?: string;
    /** A visible failure message from the last action (replaces the sent note). */
    error?: string;
}
/** The full wall: header with actions, masonry grid, and the lightbox. */
export declare function RefPicsWall({ outcome, actions }: {
    outcome: RefPicsOutcome;
    actions?: WallActions;
}): ReactNode;
export {};
//# sourceMappingURL=wall.d.ts.map