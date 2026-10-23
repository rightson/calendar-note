import moment from 'moment-timezone';
import type { Interval } from './types';
import { validateInterval } from './notes';

/** Convert wall-clock dialog values to unambiguous instants in the display zone. */
export function intervalFromFields(start: string, end: string, allDay: boolean, zone: string): Interval {
  if (!moment.tz.zone(zone)) throw new Error('Choose a valid display time zone in settings.');
  const pattern = allDay ? 'YYYY-MM-DD' : 'YYYY-MM-DDTHH:mm';
  const parse = (value: string) => {
    const parsed = moment.tz(value, pattern, true, zone);
    if (!parsed.isValid() || parsed.format(pattern) !== value) throw new Error('Enter valid start and end dates and times.');
    return parsed;
  };
  const from = parse(start);
  const until = parse(end);
  const interval = { start: allDay ? from.format('YYYY-MM-DDTHH:mm:ssZ') : from.toISOString(),
    end: allDay ? until.format('YYYY-MM-DDTHH:mm:ssZ') : until.toISOString(), allDay };
  validateInterval(interval.start, interval.end, allDay);
  return interval;
}
