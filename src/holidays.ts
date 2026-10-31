import { dateAt } from './date';
import type { CalendarEvent, CalendarKind, CalendarSource, HolidayShade } from './types';

export const DEFAULT_HOLIDAY_COLOR = '#f4cccc';
/** Theme-aware gray; FullCalendar draws background events at reduced opacity. */
export const HOLIDAY_GRAY = 'var(--text-faint)';
/** A holiday spanning longer than this is treated as bad data rather than shading months of days. */
const MAX_HOLIDAY_DAYS = 62;

export interface HolidayOptions {
  kind: CalendarKind;
  shade: HolidayShade;
  color: string;
  showEvents: boolean;
}

export function isCalendarKind(value: unknown): value is CalendarKind {
  return value === 'events' || value === 'holidays';
}

export function isHolidayShade(value: unknown): value is HolidayShade {
  return value === 'gray' || value === 'custom' || value === 'none';
}

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Effective holiday options; missing or invalid stored values fall back to safe defaults. */
export function holidayOptions(source: CalendarSource | undefined): HolidayOptions {
  return {
    kind: isCalendarKind(source?.kind) ? source.kind : 'events',
    shade: isHolidayShade(source?.holidayShade) ? source.holidayShade : 'gray',
    color: typeof source?.holidayColor === 'string' && HEX_COLOR.test(source.holidayColor) ? source.holidayColor : DEFAULT_HOLIDAY_COLOR,
    showEvents: typeof source?.showHolidayEvents === 'boolean' ? source.showHolidayEvents : true,
  };
}

export const isHolidaySource = (source: CalendarSource | undefined): boolean => holidayOptions(source).kind === 'holidays';

/** The day background a holiday source paints, or undefined when it paints none. */
export function holidayBackground(source: CalendarSource | undefined): string | undefined {
  const options = holidayOptions(source);
  if (options.kind !== 'holidays' || options.shade === 'none') return undefined;
  return options.shade === 'custom' ? options.color : HOLIDAY_GRAY;
}

const isActive = (event: CalendarEvent): boolean => event.status !== 'cancelled' && event.status !== 'removed';

/** Whether an event belongs in the main calendar as an ordinary (foreground) event. */
export function showsEvent(event: CalendarEvent, sources: CalendarSource[]): boolean {
  if (!isActive(event)) return false;
  const options = holidayOptions(sources.find(source => source.id === event.sourceId));
  return options.kind !== 'holidays' || options.showEvents;
}

/** Calendar dates (YYYY-MM-DD) an event covers in the display zone; all-day ends are exclusive dates. */
export function eventDays(event: CalendarEvent, zone: string): string[] {
  let day: ReturnType<typeof dateAt>;
  let last: string;
  if (event.allDay) {
    day = dateAt(event.start.slice(0, 10), zone);
    const end = dateAt(event.end.slice(0, 10), zone);
    // A malformed all-day event with no length still marks its start date.
    last = (end.isAfter(day) ? end.subtract(1, 'day') : day).format('YYYY-MM-DD');
  } else {
    day = dateAt(event.start, zone).startOf('day');
    const end = Date.parse(event.end) > Date.parse(event.start) ? dateAt(new Date(Date.parse(event.end) - 1), zone) : dateAt(event.start, zone);
    last = end.format('YYYY-MM-DD');
  }
  const days: string[] = [];
  while (days.length < MAX_HOLIDAY_DAYS) {
    const key = day.format('YYYY-MM-DD');
    days.push(key);
    if (key >= last) break;
    day.add(1, 'day');
  }
  return days;
}

export interface HolidayDay {
  /** Background of the first holiday source listed in settings, if any source paints one. */
  color?: string;
  titles: string[];
}

/** Holidays by date from every enabled holiday source, in settings order. */
export function holidayDays(events: CalendarEvent[], sources: CalendarSource[], zone: string): Map<string, HolidayDay> {
  const order = new Map(sources.map((source, index) => [source.id, index]));
  const holidays = events
    .filter(event => isActive(event) && isHolidaySource(sources.find(source => source.id === event.sourceId)))
    .sort((a, b) => (order.get(a.sourceId) ?? 0) - (order.get(b.sourceId) ?? 0));
  const days = new Map<string, HolidayDay>();
  for (const event of holidays) {
    const color = holidayBackground(sources.find(source => source.id === event.sourceId));
    for (const date of eventDays(event, zone)) {
      const entry = days.get(date) ?? { titles: [] };
      entry.color ??= color;
      if (!entry.titles.includes(event.title)) entry.titles.push(event.title);
      days.set(date, entry);
    }
  }
  return days;
}
