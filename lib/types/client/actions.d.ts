/**
 * Host-route action helpers for the wall and the board: proxied download,
 * save-to-Eagle, and the direct board search. All calls stay same-origin
 * with the web shell; every response is soft-parsed so a version drift or a
 * stopped Eagle app surfaces as a message instead of a thrown render.
 *
 * @module dsh-refpics/client/actions
 */
import { type Orientation, type ProviderChoice, type RefImage, type RefPicsOutcome } from '../core/outcome.ts';
/** Display/download name for one image (provider id plus a trimmed title). */
export declare function fileNameFor(image: RefImage): string;
/** Start the proxied attachment download for one image. */
export declare function openDownload(image: RefImage): void;
/** One Eagle save outcome. */
export interface EagleResult {
    ok: boolean;
    message: string;
}
/** Ask the host to add one image to the local Eagle app. */
export declare function saveToEagle(image: RefImage): Promise<EagleResult>;
/** Parameters of the direct board search. */
export interface RemoteSearchParams {
    q: string;
    provider?: ProviderChoice;
    page?: number;
    count?: number;
    orientation?: Orientation;
}
/** One board search result. */
export type RemoteSearchResult = {
    ok: true;
    outcome: RefPicsOutcome;
} | {
    ok: false;
    message: string;
};
/** Run a direct search through the host route (the sidebar board's path). */
export declare function searchRemote(params: RemoteSearchParams): Promise<RemoteSearchResult>;
//# sourceMappingURL=actions.d.ts.map