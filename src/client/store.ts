/**
 * Shared client store for dsh-refpics: the latest chat-rendered outcome per
 * session (recorded by each search_refs toolview) and the sidebar board
 * state per session (its own direct searches). A plain external store
 * (subscribe + getSnapshot) so React reads it through useSyncExternalStore
 * without tearing; every mutation replaces the top-level maps immutably.
 *
 * @module dsh-refpics/client/store
 */

import type { RefPicsOutcome } from '../core/outcome.ts'

/** One session's sidebar board state. */
export interface BoardState {
  outcome: RefPicsOutcome | null
  loading: boolean
  error: string | null
}

/** The whole client store snapshot. */
export interface RefpicsStoreSnapshot {
  /** Latest chat-search outcome per session. */
  chat: ReadonlyMap<string, RefPicsOutcome>
  /** Board state per session. */
  boards: ReadonlyMap<string, BoardState>
  /** Chat outcome sequence per session (highest seq wins on record). */
  chatSeq: ReadonlyMap<string, number>
  /** Monotonic version for change detection. */
  version: number
}

const EMPTY_BOARD: BoardState = { outcome: null, loading: false, error: null }

let snapshot: RefpicsStoreSnapshot = { chat: new Map(), boards: new Map(), chatSeq: new Map(), version: 0 }
const listeners = new Set<() => void>()

function publish(next: RefpicsStoreSnapshot): void {
  snapshot = next
  for (const listener of listeners) listener()
}

/** Subscribe to store changes (useSyncExternalStore contract). */
export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Current snapshot (useSyncExternalStore contract; stable between changes). */
export function getSnapshot(): RefpicsStoreSnapshot {
  return snapshot
}

/** Record one chat-rendered outcome; a lower-seq outcome never regresses the board source. */
export function recordChatOutcome(sessionId: string, seq: number, outcome: RefPicsOutcome): void {
  const previous = snapshot.chatSeq.get(sessionId) ?? -1
  if (seq < previous) return
  const chat = new Map(snapshot.chat)
  chat.set(sessionId, outcome)
  const chatSeq = new Map(snapshot.chatSeq)
  chatSeq.set(sessionId, seq)
  publish({ ...snapshot, chat, chatSeq, version: snapshot.version + 1 })
}

/** Mark one session's board as searching. */
export function setBoardLoading(sessionId: string): void {
  const boards = new Map(snapshot.boards)
  const current = boards.get(sessionId) ?? EMPTY_BOARD
  boards.set(sessionId, { ...current, loading: true, error: null })
  publish({ ...snapshot, boards, version: snapshot.version + 1 })
}

/** Settle one session's board with a search outcome. */
export function setBoardOutcome(sessionId: string, outcome: RefPicsOutcome): void {
  const boards = new Map(snapshot.boards)
  const current = boards.get(sessionId) ?? EMPTY_BOARD
  boards.set(sessionId, { outcome, loading: false, error: null })
  publish({ ...snapshot, boards, version: snapshot.version + 1 })
}

/** Settle one session's board with a failure message. */
export function setBoardError(sessionId: string, message: string): void {
  const boards = new Map(snapshot.boards)
  const current = boards.get(sessionId) ?? EMPTY_BOARD
  boards.set(sessionId, { ...current, loading: false, error: message })
  publish({ ...snapshot, boards, version: snapshot.version + 1 })
}
