import type { MainDateClickAction, MiniDateClickAction } from './types';

/** Where a Daily Note opens: the reused leaf beside the calendar, or a new tab on its far side. */
export type NotePlacement = 'split' | 'tab';

/**
 * Where a date clicked in the mini calendar opens its Daily Note, if at all; the main
 * calendar always moves to the date. With the main calendar hidden, moving it shows
 * nothing, so plain navigation opens the Daily Note beside the calendar instead.
 */
export function miniDateClick(action: MiniDateClickAction, miniOnly: boolean): NotePlacement | undefined {
  if (action === 'split' || action === 'tab') return action;
  return miniOnly ? 'split' : undefined;
}

export type MainDateClick = { kind: 'event' } | { kind: 'daily'; placement?: NotePlacement } | { kind: 'none' };

const DAY_VIEWS = new Set(['dayGridMonth', 'multiMonthYear', 'listWeek']);

/**
 * An empty time slot or date cell clicked in the main calendar. `auto` keeps the original
 * behaviour: a new event in time grids, the Daily Note (default placement) in Month and Year.
 */
export function mainDateClick(action: MainDateClickAction, viewType: string): MainDateClick {
  switch (action) {
    case 'event': return { kind: 'event' };
    case 'split': return { kind: 'daily', placement: 'split' };
    case 'tab': return { kind: 'daily', placement: 'tab' };
    case 'none': return { kind: 'none' };
    default: return DAY_VIEWS.has(viewType) ? { kind: 'daily' } : { kind: 'event' };
  }
}
