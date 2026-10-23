import assert from 'node:assert/strict';
import test from 'node:test';
import { visibleMonthCount } from '../src/calendar-layout';

test('mini calendar shows all complete months that fit and keeps one at small heights', () => {
  assert.equal(visibleMonthCount(900, 250), 3);
  assert.equal(visibleMonthCount(499, 250), 1);
  assert.equal(visibleMonthCount(500, 250), 2);
  assert.equal(visibleMonthCount(100, 250), 1);
});

test('mini calendar bounds very tall or unmeasured layouts', () => {
  assert.equal(visibleMonthCount(3000, 250), 6);
  assert.equal(visibleMonthCount(800, 0), 1);
  assert.equal(visibleMonthCount(Number.NaN, 250), 1);
});
