import moment from 'moment-timezone';
import 'moment/locale/en-gb';
import 'moment/locale/zh-tw';
import type { CalendarWeek, WeekRules } from './types';

export function dateAt(value: string | Date, zone: string): moment.Moment {
  if (!moment.tz.zone(zone)) throw new Error(`Unknown time zone: ${zone}`);
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = moment.tz(value, 'YYYY-MM-DD', true, zone);
    if (!date.isValid() || date.format('YYYY-MM-DD') !== value) throw new Error('Invalid calendar date.');
    return date;
  }
  const date = moment(value).tz(zone);
  if (!date.isValid()) throw new Error('Invalid calendar date.');
  return date;
}

type ScopedMoment = moment.Moment & { _locale?: moment.Locale };

function scopedWeekDate(value: string | Date, rules: WeekRules, zone: string): { date: moment.Moment; dow: number; doy: number } {
  const date = dateAt(value, zone).locale(rules.locale) as ScopedMoment;
  const locale = date.localeData();
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dow = rules.weekMode === 'iso' ? 1 : rules.weekStart === 'locale' ? locale.firstDayOfWeek() : Math.max(0, days.indexOf(rules.weekStart));
  const doy = rules.weekMode === 'iso' ? 4 : locale.firstDayOfYear();
  const scoped = Object.create(locale) as moment.Locale & { _week: { dow: number; doy: number } };
  scoped._week = { dow, doy };
  date._locale = scoped;
  return { date, dow, doy };
}

export function weekInfo(value: string | Date, rules: WeekRules, zone: string): CalendarWeek {
  const { date, dow, doy } = scopedWeekDate(value, rules, zone);
  const iso = rules.weekMode === 'iso';
  const number = iso ? date.isoWeek() : date.week();
  const year = iso ? date.isoWeekYear() : date.weekYear();
  const start = date.clone().startOf(iso ? 'isoWeek' : 'week').format('YYYY-MM-DD');
  const end = dateAt(start, zone).add(6, 'days').format('YYYY-MM-DD');
  return { number, year, label: `${year}-W${String(number).padStart(2, '0')}`, start, end,
    key: `${rules.weekMode}:${rules.locale}:${dow}:${doy}:${start}` };
}

export function formatAt(value: string | Date, format: string, rules: WeekRules, zone: string): string {
  return scopedWeekDate(value, rules, zone).date.format(format);
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/** The first column of a week row, 0 for Sunday through 6 for Saturday. */
export function firstWeekday(rules: WeekRules, zone: string, now: Date = new Date()): number {
  if (rules.weekMode === 'iso') return 1;
  return rules.weekStart === 'locale' ? dateAt(now, zone).locale(rules.locale).localeData().firstDayOfWeek() : WEEKDAYS.indexOf(rules.weekStart);
}
