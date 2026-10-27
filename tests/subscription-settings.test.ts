import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS } from '../src/settings';
import { freshState } from '../src/state';
import { safeSourceError, emptySourceCache } from '../src/history';
import { SubscriptionService } from '../src/subscriptions';
import { SettingsUpdateQueue, patchSubscription, subscriptionFailureMessage, subscriptionStatus } from '../src/subscription-settings';
import type { CalendarStore } from '../src/store';
import type { SourceSyncService } from '../src/sync';
import type { CalendarSource, PluginSettings } from '../src/types';

const source: CalendarSource = { id: 'feed', name: 'Feed', url: '', color: '#5885d8', enabled: false };
const range = { start: '2026-10-20T00:00:00Z', end: '2026-10-30T00:00:00Z' };
const url = 'https://example.test/calendar.ics';
const settings = (): PluginSettings => ({ ...DEFAULT_SETTINGS, sources: [{ ...source }] });

test('rapid URL blur and enable edits resolve against the latest saved settings and fetch', async () => {
  let current = settings();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let writes = 0;
  const queue = new SettingsUpdateQueue(() => current, async next => {
    if (++writes === 1) await gate;
    current = structuredClone(next);
  });
  const urlSave = queue.update(next => patchSubscription(next, source.id, { url }));
  const toggleSave = queue.update(next => patchSubscription(next, source.id, { url, enabled: true }), next => {
    assert.equal(next.sources[0].url, url);
  });
  release();
  await Promise.all([urlSave, toggleSave]);
  assert.equal(current.sources[0].url, url);
  assert.equal(current.sources[0].enabled, true);

  const state = freshState(current);
  const store = {
    state,
    commit: async (_writes: unknown, mutate: (value: typeof state) => void) => { mutate(state); },
  } as unknown as CalendarStore;
  const sync = { accept: async () => undefined } as unknown as SourceSyncService;
  let requests = 0;
  const subscriptions = new SubscriptionService(store, sync, async () => {
    requests++;
    return { status: 200, text: 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n' };
  });
  await subscriptions.refresh(range);
  assert.equal(requests, 1);
});

test('source patches preserve manual disable, blank inactivity, and unrelated settings', () => {
  const next = settings();
  next.locale = 'zh-tw';
  patchSubscription(next, source.id, { url, enabled: true });
  patchSubscription(next, source.id, { enabled: false });
  patchSubscription(next, source.id, { url: 'https://other.test/feed' });
  assert.equal(next.sources[0].enabled, false);
  patchSubscription(next, source.id, { url: '', enabled: true });
  assert.equal(next.sources[0].enabled, false);
  assert.equal(next.locale, 'zh-tw');
});

test('status distinguishes inactive, disabled, pending, parse failure, and displayed event count', () => {
  const cache = emptySourceCache();
  assert.match(subscriptionStatus(source, cache, 0), /Inactive/);
  const configured = { ...source, url };
  assert.match(subscriptionStatus(configured, cache, 0), /Disabled/);
  configured.enabled = true;
  assert.match(subscriptionStatus(configured, cache, 0), /Not refreshed yet/);
  cache.error = safeSourceError('parse');
  assert.match(subscriptionStatus(configured, cache, 0), /not a valid iCalendar feed/);
  assert.match(subscriptionFailureMessage({ ...settings(), sources: [configured] }, { feed: cache })!, /not a valid iCalendar feed/);
  cache.error = 'https://private.test/token';
  assert.doesNotMatch(subscriptionStatus(configured, cache, 0), /private|token/);
  assert.match(subscriptionStatus(configured, cache, 0), /Could not refresh/);
  cache.error = undefined;
  cache.lastSuccess = '2026-10-22T12:00:00Z';
  assert.match(subscriptionStatus(configured, cache, 1), /1 event in the current view/);
  assert.equal(subscriptionFailureMessage({ ...settings(), sources: [configured] }, { feed: cache }), undefined);
});
