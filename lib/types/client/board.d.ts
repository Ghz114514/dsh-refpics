/**
 * The sidebar board tab (dsh-better-sidebar integration): a Pinterest-style
 * reference board living in the right sidebar, registered as a
 * single-instance tab (`refpics:board`) through the `betterSidebar`
 * service. It mirrors the latest chat search for the session and can run
 * its own searches directly through the host /refpics/search route — 换一批
 * and 翻页 work without an agent round trip here. All state is per-session
 * in the shared store.
 *
 * @module dsh-refpics/client/board
 */
import type { ReactNode } from 'react';
import type { TabComponentProps } from 'dsh-better-sidebar/client/service';
/** Small masonry-grid glyph for the tab strip (text-only, theme-colored). */
export declare function RefpicsBoardIcon({ size }: {
    size?: number;
}): ReactNode;
/** The sidebar tab component: search box, batch controls, and the wall. */
export declare function RefpicsBoardTab(props: TabComponentProps): ReactNode;
export default RefpicsBoardTab;
//# sourceMappingURL=board.d.ts.map