import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_HOLIDAY_COLOR, HOLIDAY_GRAY, eventDays, holidayBackground, holidayDays, holidayOptions, showsEvent,
} from '../src/holidays';
import type { CalendarEvent, CalendarSource } from '../src/types';

const zone = 'Asia/Taipei';
const source = (id: string, extra: Partial<CalendarSource> = {}): CalendarSource =>
  ({ id, name: id, url: 'https://example.com/a.ics', color: '#5885d8', enabled: true, ...extra });
const event = (sourceId: string, title: string, start: string, end: string, allDay = true, status?: CalendarEvent['status']): CalendarEvent =>
  ({ id: `${sourceId}|${title}`, sourceId, uid: title, title, start, end, allDay, ...status ? { status } : {} });

test('older subscriptions stay ordinary event calendars with safe holiday defaults', () => {
  assert.deepEqual(holidayOptions(source('a')), { kind: 'events', shade: 'gray', color: DEFAULT_HOLIDAY_COLOR, showEvents: true });
  assert.equal(holidayBackground(source('a')), undefined);
  const invalid = holidayOptions(source('a', { kind: 'x' as never, holidayShade: 'red' as never, holidayColor: 'url(evil)', showHolidayEvents: 1 as never }));
  assert.deepEqual(invalid, { kind: 'events', shade: 'gray', color: DEFAULT_HOLIDAY_COLOR, showEvents: true });
});

test('holiday background follows the chosen shade', () => {
  assert.equal(holidayBackground(source('h', { kind: 'holidays' })), HOLIDAY_GRAY);
  assert.equal(holidayBackground(source('h', { kind: 'holidays', holidayShade: 'custom', holidayColor: '#ffeeaa' })), '#ffeeaa');
  assert.equal(holidayBackground(source('h', { kind: 'holidays', holidayShade: 'none' })), undefined);
});

test('all-day holidays cover their dates up to the exclusive end date', () => {
  assert.deepEqual(eventDays(event('h', 'One', '2026-10-10', '2026-10-11'), zone), ['2026-10-10']);
  assert.deepEqual(eventDays(event('h', 'Long', '2026-10-09T00:00:00+08:00', '2026-10-12T00:00:00+08:00'), zone),
    ['2026-10-09', '2026-10-10', '2026-10-11']);
  assert.deepEqual(eventDays(event('h', 'Empty', '2026-10-10', '2026-10-10'), zone), ['2026-10-10']);
});

test('timed holidays cover the display-zone dates they touch, ending exclusively', () => {
  assert.deepEqual(eventDays(event('h', 'Eve', '2026-12-31T14:00:00Z', '2026-12-31T16:00:00Z', false), zone), ['2026-12-31']);
  assert.deepEqual(eventDays(event('h', 'Night', '2026-12-31T15:00:00Z', '2026-12-31T17:00:00Z', false), zone), ['2026-12-31', '2027-01-01']);
  assert.deepEqual(eventDays(event('h', 'To midnight', '2026-12-31T08:00:00+08:00', '2027-01-01T00:00:00+08:00', false), zone), ['2026-12-31']);
});

test('holiday days merge calendars in settings order and skip cancelled holidays', () => {
  const sources = [
    source('work'),
    source('tw', { kind: 'holidays', holidayShade: 'custom', holidayColor: '#ffcccc' }),
    source('us', { kind: 'holidays' }),
  ];
  const days = holidayDays([
    event('us', 'Columbus Day', '2026-10-12', '2026-10-13'),
    event('tw', 'National Day', '2026-10-10', '2026-10-11'),
    event('us', 'Shared', '2026-10-10', '2026-10-11'),
    event('tw', 'Cancelled', '2026-10-20', '2026-10-21', true, 'cancelled'),
    event('work', 'Standup', '2026-10-10', '2026-10-11'),
  ], sources, zone);
  assert.deepEqual([...days.keys()].sort(), ['2026-10-10', '2026-10-12']);
  assert.deepEqual(days.get('2026-10-10'), { color: '#ffcccc', titles: ['National Day', 'Shared'] });
  assert.deepEqual(days.get('2026-10-12'), { color: HOLIDAY_GRAY, titles: ['Columbus Day'] });
});

test('an unshaded holiday calendar still names its days without a background', () => {
  const days = holidayDays([event('h', 'Day off', '2026-10-10', '2026-10-11')], [source('h', { kind: 'holidays', holidayShade: 'none' })], zone);
  assert.equal(days.get('2026-10-10')?.color, undefined);
  assert.deepEqual(days.get('2026-10-10')?.titles, ['Day off']);
});

test('hidden holiday events leave the calendar while other events stay', () => {
  const sources = [source('work'), source('h', { kind: 'holidays', showHolidayEvents: false }), source('shown', { kind: 'holidays' })];
  assert.equal(showsEvent(event('work', 'Standup', '2026-10-10', '2026-10-11'), sources), true);
  assert.equal(showsEvent(event('h', 'Hidden', '2026-10-10', '2026-10-11'), sources), false);
  assert.equal(showsEvent(event('shown', 'Visible', '2026-10-10', '2026-10-11'), sources), true);
  assert.equal(showsEvent(event('local', 'Mine', '2026-10-10', '2026-10-11'), sources), true);
  assert.equal(showsEvent(event('work', 'Gone', '2026-10-10', '2026-10-11', true, 'removed'), sources), false);
});
