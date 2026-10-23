/** Number of complete mini-month cards that fit without scrolling. */
export function visibleMonthCount(availableHeight: number, cardHeight: number): number {
  if (!Number.isFinite(availableHeight) || !Number.isFinite(cardHeight) || cardHeight <= 0) return 1;
  return Math.max(1, Math.min(6, Math.floor(availableHeight / cardHeight)));
}
