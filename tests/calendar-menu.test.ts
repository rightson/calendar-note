import assert from 'node:assert/strict';
import test from 'node:test';
import { editMenuTitle, eventsAt } from '../src/calendar-menu';
import type { CalendarEvent } from '../src/types';

const zone = 'Asia/Taipei';
const event = (id: string, start: string, end: string, allDay = false): CalendarEvent =>
  ({ id, sourceId: 'local', uid: id, title: id, start, end, allDay });
const standup = event('Standup', '2026-10-22T10:00:00+08:00', '2026-10-22T10:30:00+08:00');
const review = event('Review', '2026-10-22T09:30:00+08:00', '2026-10-22T11:00:00+08:00');
const lunch = event('Lunch', '2026-10-22T12:00:00+08:00', '2026-10-22T13:00:00+08:00');
const reminder = event('Reminder', '2026-10-22T10:15:00+08:00', '2026-10-22T10:15:00+08:00');
const holiday = event('Holiday', '2026-10-22T00:00:00+08:00', '2026-10-23T00:00:00+08:00', true);
const late = event('Late', '2026-10-21T23:30:00+08:00', '2026-10-22T00:30:00+08:00');
const all = [standup, review, lunch, reminder, holiday, late];
const slot = (start: string, end: string) => ({ kind: 'slot' as const, start, end });

test('a time slot lists every timed event that overlaps it, earliest first', () => {
  const ids = (span: ReturnType<typeof slot>) => eventsAt(all, span, zone).map(item => item.id);
  assert.deepEqual(ids(slot('2026-10-22T10:00:00+08:00', '2026-10-22T10:15:00+08:00')), ['Review', 'Standup']);
  assert.deepEqual(ids(slot('2026-10-22T10:15:00+08:00', '2026-10-22T10:30:00+08:00')), ['Review', 'Standup', 'Reminder']);
  assert.deepEqual(ids(slot('2026-10-22T11:00:00+08:00', '2026-10-22T11:15:00+08:00')), []);
  assert.deepEqual(ids(slot('2026-10-22T12:30:00+08:00', '2026-10-22T12:45:00+08:00')), ['Lunch']);
});

test('a day lists its all-day events first, then timed events crossing into it', () => {
  assert.deepEqual(eventsAt(all, { kind: 'day', date: '2026-10-22' }, zone).map(item => item.id),
    ['Holiday', 'Late', 'Review', 'Standup', 'Reminder', 'Lunch']);
  assert.deepEqual(eventsAt(all, { kind: 'day', date: '2026-10-23' }, zone).map(item => item.id), []);
  assert.deepEqual(eventsAt(all, { kind: 'day', date: '2026-10-21' }, zone).map(item => item.id), ['Late']);
});

test('the right-clicked event is always offered, once', () => {
  const span = slot('2026-10-22T15:00:00+08:00', '2026-10-22T15:15:00+08:00');
  assert.deepEqual(eventsAt(all, span, zone, lunch).map(item => item.id), ['Lunch']);
  assert.deepEqual(eventsAt(all, slot('2026-10-22T12:00:00+08:00', '2026-10-22T12:15:00+08:00'), zone, lunch).map(item => item.id), ['Lunch']);
});

test('edit entries name the event and its time', () => {
  assert.equal(editMenuTitle(standup, zone), 'Edit “Standup” · 10:00–10:30');
  assert.equal(editMenuTitle(reminder, zone), 'Edit “Reminder” · 10:15');
  assert.equal(editMenuTitle(holiday, zone), 'Edit “Holiday” · All day');
});
