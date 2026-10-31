import assert from 'node:assert/strict';
import test from 'node:test';
import { firstWeekday } from '../src/date';
import { chooseMonthDensity, eventCountsByDay, monthSpanLabel, monthsThatFit } from '../src/months-layout';
import type { CalendarEvent } from '../src/types';

test('the month calendar adds following months while whole cards fit its height', () => {
  assert.equal(monthsThatFit(240, 240, 14), 1);
  assert.equal(monthsThatFit(493, 240, 14), 1);
  assert.equal(monthsThatFit(494, 240, 14), 2);
  assert.equal(monthsThatFit(1000, 240, 14), 3);
  assert.equal(monthsThatFit(100, 240, 14), 1);
});

test('the month calendar fills every column and stays bounded', () => {
  assert.equal(monthsThatFit(494, 240, 14, 2), 4);
  assert.equal(monthsThatFit(100000, 240, 14), 24);
  assert.equal(monthsThatFit(0, 0, 14, 3), 3);
  assert.equal(monthsThatFit(Number.NaN, 240, 14), 1);
});

test('the visible span label names the first and last month', () => {
  assert.equal(monthSpanLabel('2026-10-01', 1, 'UTC'), 'Oct 2026');
  assert.equal(monthSpanLabel('2026-10-01', 3, 'UTC'), 'Oct – Dec 2026');
  assert.equal(monthSpanLabel('2026-11-01', 4, 'UTC'), 'Nov 2026 – Feb 2027');
});

const event = (id: string, start: string, end: string, allDay = false, status?: CalendarEvent['status']): CalendarEvent =>
  ({ id, sourceId: 'local', uid: id, title: id, start, end, allDay, ...status ? { status } : {} });

test('event dots count each day an event touches in the display zone', () => {
  const counts = eventCountsByDay([
    event('a', '2026-11-02T01:00:00Z', '2026-11-02T02:00:00Z'),
    event('b', '2026-11-02', '2026-11-05', true),
    // 23:30–00:00 in Taipei: the exclusive end at midnight stays on Nov 2.
    event('c', '2026-11-02T15:30:00Z', '2026-11-02T16:00:00Z'),
    // 23:30 UTC on Nov 2 is already Nov 3 in Taipei.
    event('f', '2026-11-02T23:30:00Z', '2026-11-03T00:30:00Z'),
    event('d', '2026-11-02T03:00:00Z', '2026-11-02T03:00:00Z'),
    event('e', '2026-11-02T03:00:00Z', '2026-11-02T04:00:00Z', false, 'cancelled'),
  ], 'Asia/Taipei', '2026-11-01', '2026-11-04');
  assert.deepEqual(Object.fromEntries(counts), { '2026-11-02': 4, '2026-11-03': 2 });
});

test('week rows start on the configured weekday', () => {
  assert.equal(firstWeekday({ locale: 'en', weekMode: 'iso', weekStart: 'sunday' }, 'UTC'), 1);
  assert.equal(firstWeekday({ locale: 'en', weekMode: 'calendar', weekStart: 'saturday' }, 'UTC'), 6);
  assert.equal(firstWeekday({ locale: 'en-gb', weekMode: 'calendar', weekStart: 'locale' }, 'UTC'), 1);
});

test('cards shrink only until three months fit', () => {
  const cards = [{ height: 240, gap: 14 }, { height: 175, gap: 10 }, { height: 140, gap: 6 }];
  // Tall enough: the roomy size already shows three or more.
  assert.deepEqual(chooseMonthDensity(1300, cards), { index: 0, count: 5 });
  assert.deepEqual(chooseMonthDensity(760, cards), { index: 0, count: 3 });
  // Half a sidebar: shrink to the first size that reaches three.
  assert.deepEqual(chooseMonthDensity(560, cards), { index: 1, count: 3 });
  assert.deepEqual(chooseMonthDensity(440, cards), { index: 2, count: 3 });
  // Too short for three: the most months, with the roomiest size on a tie.
  assert.deepEqual(chooseMonthDensity(300, cards), { index: 2, count: 2 });
  assert.deepEqual(chooseMonthDensity(200, cards), { index: 1, count: 1 });
  // Not even one whole card fits: the tightest hides the least.
  assert.deepEqual(chooseMonthDensity(100, cards), { index: 2, count: 1 });
});

test('columns count toward the three-month target', () => {
  const cards = [{ height: 240, gap: 14 }, { height: 140, gap: 6 }];
  assert.deepEqual(chooseMonthDensity(500, cards, 2), { index: 0, count: 4 });
});

test('a higher minimum keeps shrinking cards; a minimum of one never shrinks them when one fits', () => {
  const cards = [{ height: 240, gap: 14 }, { height: 175, gap: 10 }, { height: 140, gap: 6 }];
  assert.deepEqual(chooseMonthDensity(760, cards, 1, 5), { index: 2, count: 5 });
  assert.deepEqual(chooseMonthDensity(300, cards, 1, 1), { index: 0, count: 1 });
});
