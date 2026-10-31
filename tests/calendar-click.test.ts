import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_SETTINGS, normalizePluginSettings } from '../src/settings';
import { mainDateClick, miniDateClick } from '../src/calendar-click';

test('date click settings default to the original behaviour and drop unknown values', () => {
  assert.equal(DEFAULT_SETTINGS.miniDateClickAction, 'navigate');
  assert.equal(DEFAULT_SETTINGS.mainDateClickAction, 'auto');
  assert.equal(normalizePluginSettings({}).miniDateClickAction, 'navigate');
  assert.equal(normalizePluginSettings({}).mainDateClickAction, 'auto');
  for (const value of ['navigate', 'split', 'tab'] as const) {
    assert.equal(normalizePluginSettings({ miniDateClickAction: value }).miniDateClickAction, value);
  }
  for (const value of ['auto', 'event', 'split', 'tab', 'none'] as const) {
    assert.equal(normalizePluginSettings({ mainDateClickAction: value }).mainDateClickAction, value);
  }
  assert.equal(normalizePluginSettings({ miniDateClickAction: 'event' }).miniDateClickAction, 'navigate');
  assert.equal(normalizePluginSettings({ mainDateClickAction: 'dialog' }).mainDateClickAction, 'auto');
});

test('mini calendar dates navigate only, or also open the Daily Note where chosen', () => {
  assert.equal(miniDateClick('navigate', false), undefined);
  assert.equal(miniDateClick('split', false), 'split');
  assert.equal(miniDateClick('tab', false), 'tab');
});

test('with the main calendar hidden, plain navigation opens the Daily Note beside the calendar', () => {
  assert.equal(miniDateClick('navigate', true), 'split');
  assert.equal(miniDateClick('split', true), 'split');
  assert.equal(miniDateClick('tab', true), 'tab');
});

test('auto keeps new events in time grids and Daily Notes in Month, Year, and List', () => {
  for (const view of ['timeGridWeek', 'timeGridDay', 'customDays']) assert.deepEqual(mainDateClick('auto', view), { kind: 'event' });
  for (const view of ['dayGridMonth', 'multiMonthYear', 'listWeek']) assert.deepEqual(mainDateClick('auto', view), { kind: 'daily' });
});

test('an explicit main calendar choice applies in every view', () => {
  for (const view of ['timeGridWeek', 'dayGridMonth', 'multiMonthYear']) {
    assert.deepEqual(mainDateClick('event', view), { kind: 'event' });
    assert.deepEqual(mainDateClick('split', view), { kind: 'daily', placement: 'split' });
    assert.deepEqual(mainDateClick('tab', view), { kind: 'daily', placement: 'tab' });
    assert.deepEqual(mainDateClick('none', view), { kind: 'none' });
  }
});
