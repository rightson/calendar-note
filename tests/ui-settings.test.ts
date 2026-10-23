import assert from 'node:assert/strict';
import test from 'node:test';
import type { App } from 'obsidian';
import { DEFAULT_SETTINGS, resolveDailySettings, resolveWeekRules, resolveWeeklySettings } from '../src/settings';

test('Calendar system locale comes from the host Moment setting', () => {
  const host = globalThis as unknown as Record<string, unknown>;
  const previous = host.moment;
  host.moment = { locale: () => 'en-gb' };
  try {
    const app = { plugins: { enabledPlugins: new Set(['calendar']), plugins: {
      calendar: { settings: { localeOverride: 'system-default', weekStart: 0 } },
    } } } as unknown as App;
    assert.deepEqual(resolveWeekRules(app, DEFAULT_SETTINGS), { locale: 'en-gb', weekMode: 'calendar', weekStart: 'sunday' });
  } finally { host.moment = previous; }
});

test('enabled note providers override fallbacks without changing their blank root folder', () => {
  const app = { internalPlugins: { plugins: { 'daily-notes': { enabled: true, instance: { options: {
    folder: '', format: 'YYYY/MM/DD', template: 'Templates/Day',
  } } } } }, plugins: { enabledPlugins: new Set(['periodic-notes', 'calendar']), plugins: {
    'periodic-notes': { settings: { weekly: { enabled: true, folder: '', format: 'GGGG-[W]WW', template: '' } } },
    calendar: { settings: { weeklyNoteFolder: 'Calendar weeks', weeklyNoteFormat: 'gggg-[W]ww' } },
  } } } as unknown as App;
  assert.deepEqual(resolveDailySettings(app, DEFAULT_SETTINGS), { folder: '', format: 'YYYY/MM/DD', template: 'Templates/Day', provider: 'daily-notes' });
  assert.deepEqual(resolveWeeklySettings(app, DEFAULT_SETTINGS), { folder: '', format: 'GGGG-[W]WW', template: '', provider: 'periodic-notes' });
});
