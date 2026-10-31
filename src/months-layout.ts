import { dateAt } from './date';
import type { CalendarEvent } from './types';

export const MONTHS_VIEW_MAX = 24;

/**
 * Whole month cards that fit the panel: as many rows as its height holds,
 * times the columns its width holds. Always at least one month.
 */
export function monthsThatFit(
  availableHeight: number, cardHeight: number, gap: number, columns = 1, max = MONTHS_VIEW_MAX,
): number {
  const cols = Number.isFinite(columns) && columns >= 1 ? Math.floor(columns) : 1;
  if (!Number.isFinite(availableHeight) || !Number.isFinite(cardHeight) || cardHeight <= 0) return Math.min(max, cols);
  const rows = Math.max(1, Math.floor((availableHeight + Math.max(0, gap)) / (cardHeight + Math.max(0, gap))));
  return Math.max(1, Math.min(max, rows * cols));
}

/** Short label for the visible span, such as "Oct – Dec 2026" or "Nov 2026 – Feb 2027". */
export function monthSpanLabel(firstMonth: string, count: number, zone: string): string {
  const first = dateAt(firstMonth, zone).locale('en').startOf('month');
  if (count <= 1) return first.format('MMM YYYY');
  const last = first.clone().add(count - 1, 'months');
  return first.year() === last.year() ? `${first.format('MMM')} – ${last.format('MMM YYYY')}` : `${first.format('MMM YYYY')} – ${last.format('MMM YYYY')}`;
}

/**
 * How many visible events touch each calendar day in [from, to), keyed by
 * YYYY-MM-DD in the display zone. All-day ends are exclusive dates.
 */
export function eventCountsByDay(events: CalendarEvent[], zone: string, from: string, to: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const event of events) {
    if (event.status === 'cancelled' || event.status === 'removed') continue;
    let first: string; let last: string;
    if (event.allDay) {
      first = event.start.slice(0, 10);
      const end = event.end.slice(0, 10);
      last = end > first ? dateAt(end, zone).subtract(1, 'day').format('YYYY-MM-DD') : first;
    } else {
      const start = Date.parse(event.start);
      const end = Date.parse(event.end);
      if (!Number.isFinite(start)) continue;
      first = dateAt(new Date(start), zone).format('YYYY-MM-DD');
      last = Number.isFinite(end) && end > start ? dateAt(new Date(end - 1), zone).format('YYYY-MM-DD') : first;
    }
    if (last < from || first >= to) continue;
    const day = dateAt(first < from ? from : first, zone);
    for (let key = day.format('YYYY-MM-DD'); key <= last && key < to; key = day.add(1, 'day').format('YYYY-MM-DD')) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return counts;
}
