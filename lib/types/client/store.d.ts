/**
 * Shared client store for dsh-refpics: the latest chat-rendered outcome per
 * session (recorded by each search_refs toolview) and the sidebar board
 * state per session (its own direct searches). A plain external store
 * (subscribe + getSnapshot) so React reads it through useSyncExternalStore
 * without tearing; every mutation replaces the top-level maps immutably.
 *
 * @module dsh-refpics/client/store
 */
import type { RefPicsOutcome } from '../core/outcome.ts';
/** One session's sidebar board state. */
export interface BoardState {
    outcome: RefPicsOutcome | null;
    loading: boolean;
    error: string | null;
}
/** The whole client store snapshot. */
export interface RefpicsStoreSnapshot {
    /** Latest chat-search outcome per session. */
    chat: ReadonlyMap<string, RefPicsOutcome>;
    /** Board state per session. */
    boards: ReadonlyMap<string, BoardState>;
    /** Chat outcome sequence per session (highest seq wins on record). */
    chatSeq: ReadonlyMap<string, number>;
    /** Monotonic version for change detection. */
    version: number;
}
/** Subscribe to store changes (useSyncExternalStore contract). */
export declare function subscribe(listener: () => void): () => void;
/** Current snapshot (useSyncExternalStore contract; stable between changes). */
export declare function getSnapshot(): RefpicsStoreSnapshot;
/** Record one chat-rendered outcome; a lower-seq outcome never regresses the board source. */
export declare function recordChatOutcome(sessionId: string, seq: number, outcome: RefPicsOutcome): void;
/** Mark one session's board as searching. */
export declare function setBoardLoading(sessionId: string): void;
/** Settle one session's board with a search outcome. */
export declare function setBoardOutcome(sessionId: string, outcome: RefPicsOutcome): void;
/** Settle one session's board with a failure message. */
export declare function setBoardError(sessionId: string, message: string): void;
//# sourceMappingURL=store.d.ts.map