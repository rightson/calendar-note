export const SIDEBAR_DEFAULT_WIDTH = 260;
export const SIDEBAR_MIN_WIDTH = 200;
export const SIDEBAR_MAX_WIDTH = 480;
export const CALENDAR_MIN_WIDTH = 320;

/** Saved widths stay useful even when a larger or smaller window opens next time. */
export function normalizeSidebarWidth(raw: unknown, fallback = SIDEBAR_DEFAULT_WIDTH): number {
  const width = typeof raw === 'number' && Number.isFinite(raw) ? raw : fallback;
  return Math.round(Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, width)));
}

/** A zero result tells the view to collapse the sidebar for a narrow container. */
export function sidebarWidthForContainer(raw: unknown, containerWidth: number): number {
  if (!Number.isFinite(containerWidth) || containerWidth < SIDEBAR_MIN_WIDTH + CALENDAR_MIN_WIDTH) return 0;
  return Math.min(normalizeSidebarWidth(raw), Math.floor(containerWidth - CALENDAR_MIN_WIDTH));
}

/** Returns undefined for keys that should keep their normal browser behavior. */
export function resizeSidebarWithKeyboard(
  current: unknown, key: string, containerWidth: number, shiftKey = false,
): number | undefined {
  const available = sidebarWidthForContainer(SIDEBAR_MAX_WIDTH, containerWidth);
  if (!available) return undefined;
  const step = shiftKey ? 48 : 16;
  const width = sidebarWidthForContainer(current, containerWidth);
  switch (key) {
    case 'ArrowLeft': return Math.max(SIDEBAR_MIN_WIDTH, width - step);
    case 'ArrowRight': return Math.min(available, width + step);
    case 'Home': return SIDEBAR_MIN_WIDTH;
    case 'End': return available;
    default: return undefined;
  }
}

export type CalendarPanel = 'sidebar' | 'main';

/** Hiding one panel shows the other, so the view never ends up empty. */
export function togglePanel(
  state: { sidebarCollapsed: boolean; mainCollapsed: boolean }, panel: CalendarPanel,
): { sidebarCollapsed: boolean; mainCollapsed: boolean } {
  if (panel === 'sidebar') return state.sidebarCollapsed ? { ...state, sidebarCollapsed: false } : { sidebarCollapsed: true, mainCollapsed: false };
  return state.mainCollapsed ? { ...state, mainCollapsed: false } : { sidebarCollapsed: false, mainCollapsed: true };
}
