import assert from 'node:assert/strict';
import test from 'node:test';
import { firstWeekday } from '../src/date';
import { eventCountsByDay, monthSpanLabel, monthsThatFit } from '../src/months-layout';
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
