import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_SETTINGS, normalizePluginSettings } from '../src/settings';
import {
  normalizeSidebarWidth, resizeSidebarWithKeyboard, sidebarWidthForContainer, togglePanel,
  SIDEBAR_DEFAULT_WIDTH, SIDEBAR_MAX_WIDTH, SIDEBAR_MIN_WIDTH,
} from '../src/sidebar-layout';

test('older saved settings gain safe layout defaults without changing other values', () => {
  const restored = normalizePluginSettings({ eventPattern: 'Events/{title}' });
  assert.equal(restored.eventPattern, 'Events/{title}');
  assert.equal(restored.sidebarWidth, SIDEBAR_DEFAULT_WIDTH);
  assert.equal(restored.sidebarCollapsed, false);
  assert.equal(restored.workdaysOnly, false);
  assert.equal(restored.moveEventNotes, true);
  assert.equal(DEFAULT_SETTINGS.sidebarWidth, SIDEBAR_DEFAULT_WIDTH);
  assert.equal(normalizePluginSettings({ moveEventNotes: false }).moveEventNotes, false);
  assert.equal(normalizePluginSettings({ moveEventNotes: 'no' }).moveEventNotes, true);
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

test('hiding one calendar panel shows the other so the view is never empty', () => {
  const both = { sidebarCollapsed: false, mainCollapsed: false };
  assert.deepEqual(togglePanel(both, 'main'), { sidebarCollapsed: false, mainCollapsed: true });
  assert.deepEqual(togglePanel(both, 'sidebar'), { sidebarCollapsed: true, mainCollapsed: false });
  assert.deepEqual(togglePanel({ sidebarCollapsed: false, mainCollapsed: true }, 'main'), both);
  assert.deepEqual(togglePanel({ sidebarCollapsed: false, mainCollapsed: true }, 'sidebar'), { sidebarCollapsed: true, mainCollapsed: false });
  assert.deepEqual(togglePanel({ sidebarCollapsed: true, mainCollapsed: false }, 'main'), { sidebarCollapsed: false, mainCollapsed: true });
  assert.deepEqual(togglePanel({ sidebarCollapsed: true, mainCollapsed: false }, 'sidebar'), both);
});

test('saved main calendar collapse survives normalization but never hides both panels', () => {
  assert.equal(normalizePluginSettings({}).mainCollapsed, false);
  assert.equal(normalizePluginSettings({ mainCollapsed: true }).mainCollapsed, true);
  assert.equal(normalizePluginSettings({ mainCollapsed: 'yes' }).mainCollapsed, false);
  const both = normalizePluginSettings({ mainCollapsed: true, sidebarCollapsed: true });
  assert.equal(both.sidebarCollapsed, true);
  assert.equal(both.mainCollapsed, false);
});

test('event clicks show details by default and keep a valid saved choice', () => {
  assert.equal(DEFAULT_SETTINGS.eventClickAction, 'dialog');
  assert.equal(normalizePluginSettings({}).eventClickAction, 'dialog');
  assert.equal(normalizePluginSettings({ eventClickAction: 'split' }).eventClickAction, 'split');
  assert.equal(normalizePluginSettings({ eventClickAction: 'tab' }).eventClickAction, 'tab');
  assert.equal(normalizePluginSettings({ eventClickAction: 'popup' }).eventClickAction, 'dialog');
});
