import { jsx as _jsx } from "react/jsx-runtime";
import { RefpicsBoardIcon, RefpicsBoardTab } from "./board.js";
import { setBetterSidebarService, setSessionsService } from "./bridge.js";
import { RefPicsToolView } from "./RefPicsToolView.js";
/** Locale namespace of the browser half (reserved for future dictionary use). */
export const NS = 'ref-pics';
/** Required services: slots (toolview), sessions (agent round trips). The betterSidebar service is optional and wired opportunistically. */
export const inject = ['slots', 'sessions'];
/** Apply the browser half. */
export function apply(ctx) {
    ctx.inject(['sessions'], (scope) => {
        setSessionsService(scope.sessions);
    });
    // Sidebar board tab: only when dsh-better-sidebar is installed. Its
    // service mounts after ours in the family composition, so registration
    // rides ctx.inject and its disposer rides a fiber effect.
    ctx.inject(['betterSidebar'], (scope) => {
        const sidebar = scope.betterSidebar;
        if (sidebar === undefined)
            return;
        setBetterSidebarService(sidebar);
        const dispose = sidebar.registerTab({
            id: 'refpics:board',
            title: () => '参考图',
            icon: (size) => _jsx(RefpicsBoardIcon, { size: size }),
            order: 130,
            single: true,
            component: (props) => _jsx(RefpicsBoardTab, { ...props }),
        });
        ctx.effect(() => dispose, 'refpics: sidebar board tab');
    });
    // Keyed toolview: waits for the slot declaration owned by the tool UI package.
    ctx.inject(['slots'], (scope) => {
        scope.slots.inject('tool.call.toolview', () => scope.slots.register({ name: 'tool.call.toolview', key: 'search_refs', priority: 0, registrant: 'dsh-refpics' }, RefPicsToolView));
    });
}
