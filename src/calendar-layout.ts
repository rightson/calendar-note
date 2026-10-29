/** Number of complete mini-month cards that fit without scrolling. */
export function visibleMonthCount(availableHeight: number, cardHeight: number): number {
  if (!Number.isFinite(availableHeight) || !Number.isFinite(cardHeight) || cardHeight <= 0) return 1;
  return Math.max(1, Math.min(6, Math.floor(availableHeight / cardHeight)));
}

export const MINI_MONTH_MIN_WIDTH = 220;
export const MINI_MONTH_GAP = 20;

/** Mini-month columns that fit when the mini calendar fills the whole view. */
export function miniMonthColumns(availableWidth: number): number {
  if (!Number.isFinite(availableWidth) || availableWidth <= 0) return 1;
  return Math.max(1, Math.floor((availableWidth + MINI_MONTH_GAP) / (MINI_MONTH_MIN_WIDTH + MINI_MONTH_GAP)));
}
