import assert from 'node:assert/strict';
import test from 'node:test';
import { intervalFromFields } from '../src/calendar-input';

test('time entry respects the display zone and crosses midnight', () => {
  assert.deepEqual(intervalFromFields('2026-10-23T23:45', '2026-10-24T00:15', false, 'Asia/Taipei'), {
    start: '2026-10-23T15:45:00.000Z', end: '2026-10-23T16:15:00.000Z', allDay: false,
  });
});

test('all-day end is exclusive and must follow start', () => {
  assert.deepEqual(intervalFromFields('2026-10-23', '2026-10-24', true, 'Asia/Taipei'), {
    start: '2026-10-23T00:00:00+08:00', end: '2026-10-24T00:00:00+08:00', allDay: true,
  });
  assert.throws(() => intervalFromFields('2026-10-23', '2026-10-23', true, 'Asia/Taipei'));
});

test('dialog rejects nonexistent wall times, malformed fields, and reverse ranges', () => {
  assert.throws(() => intervalFromFields('2026-03-08T02:30', '2026-03-08T03:30', false, 'America/New_York'));
  assert.throws(() => intervalFromFields('2026-02-30T09:00', '2026-03-01T10:00', false, 'Asia/Taipei'));
  assert.throws(() => intervalFromFields('2026-10-23T10:00', '2026-10-23T09:00', false, 'Asia/Taipei'));
  assert.throws(() => intervalFromFields('2026-10-23T09:00', '2026-10-23T10:00', false, 'Mars/Olympus'));
});
