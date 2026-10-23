import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_SETTINGS, normalizePluginSettings } from '../src/settings';
import {
  normalizeSidebarWidth, resizeSidebarWithKeyboard, sidebarWidthForContainer,
  SIDEBAR_DEFAULT_WIDTH, SIDEBAR_MAX_WIDTH, SIDEBAR_MIN_WIDTH,
} from '../src/sidebar-layout';

test('older saved settings gain safe layout defaults without changing other values', () => {
  const restored = normalizePluginSettings({ eventPattern: 'Events/{title}' });
  assert.equal(restored.eventPattern, 'Events/{title}');
  assert.equal(restored.sidebarWidth, SIDEBAR_DEFAULT_WIDTH);
  assert.equal(restored.sidebarCollapsed, false);
  assert.equal(restored.workdaysOnly, false);
  assert.equal(DEFAULT_SETTINGS.sidebarWidth, SIDEBAR_DEFAULT_WIDTH);
});

test('saved sidebar preferences survive normalization and bad values cannot poison layout', () => {
  const saved = normalizePluginSettings({ sidebarWidth: 327.6, sidebarCollapsed: true, workdaysOnly: true });
  assert.equal(saved.sidebarWidth, 328);
  assert.equal(saved.sidebarCollapsed, true);
  assert.equal(saved.workdaysOnly, true);
  const invalid = normalizePluginSettings({ sidebarWidth: Infinity, sidebarCollapsed: 'yes', workdaysOnly: 1 });
  assert.equal(invalid.sidebarWidth, SIDEBAR_DEFAULT_WIDTH);
  assert.equal(invalid.sidebarCollapsed, false);
  assert.equal(invalid.workdaysOnly, false);
  assert.equal(normalizePluginSettings({ sidebarWidth: -999 }).sidebarWidth, SIDEBAR_MIN_WIDTH);
  assert.equal(normalizePluginSettings({ sidebarWidth: 9999 }).sidebarWidth, SIDEBAR_MAX_WIDTH);
});

test('sidebar width leaves room for calendar and keyboard resizing respects bounds', () => {
  assert.equal(sidebarWidthForContainer(480, 700), 380);
  assert.equal(sidebarWidthForContainer(260, 500), 0);
  assert.equal(normalizeSidebarWidth(Number.NaN), SIDEBAR_DEFAULT_WIDTH);
  assert.equal(resizeSidebarWithKeyboard(260, 'ArrowRight', 900), 276);
  assert.equal(resizeSidebarWithKeyboard(260, 'ArrowLeft', 900, true), 212);
  assert.equal(resizeSidebarWithKeyboard(260, 'Home', 900), SIDEBAR_MIN_WIDTH);
  assert.equal(resizeSidebarWithKeyboard(260, 'End', 700), 380);
  assert.equal(resizeSidebarWithKeyboard(260, 'Enter', 900), undefined);
  assert.equal(resizeSidebarWithKeyboard(260, 'ArrowRight', 500), undefined);
});
