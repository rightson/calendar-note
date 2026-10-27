import { safeStoredSourceError, type SourceCache } from './history';
import type { CalendarSource, PluginSettings } from './types';

/** Queue complete settings saves, then resolve each edit against the latest state. */
export class SettingsUpdateQueue {
  private pending: Promise<void> = Promise.resolve();

  constructor(
    private readonly current: () => PluginSettings,
    private readonly persist: (settings: PluginSettings) => Promise<void>,
  ) {}

  update(change: (settings: PluginSettings) => void, validate?: (settings: PluginSettings) => void): Promise<void> {
    const run = this.pending.then(async () => {
      const next = structuredClone(this.current());
      change(next);
      validate?.(next);
      await this.persist(next);
    });
    this.pending = run.then(() => undefined, () => undefined);
    return run;
  }
}

export function patchSubscription(settings: PluginSettings, id: string, patch: Partial<CalendarSource>): void {
  const source = settings.sources.find(item => item.id === id);
  if (!source) return;
  Object.assign(source, patch);
  if (!source.url.trim()) source.enabled = false;
}

export function safeSubscriptionError(error: string | undefined): string | undefined {
  return safeStoredSourceError(error);
}

export function subscriptionStatus(source: CalendarSource, cache: SourceCache | undefined, visibleCount?: number): string {
  if (!source.url.trim()) return 'Inactive: add a subscription URL.';
  if (!source.enabled) return 'Disabled. Enable this subscription to refresh it.';
  const countText = visibleCount === undefined ? '' : ` ${visibleCount} ${visibleCount === 1 ? 'event' : 'events'} in the current view.`;
  const error = safeSubscriptionError(cache?.error);
  if (error) return `Last refresh failed: ${error}${countText}`;
  if (cache?.lastSuccess) return `Last refreshed: ${cache.lastSuccess}.${countText}`;
  return `Not refreshed yet.${countText}`;
}

export function subscriptionFailureMessage(settings: PluginSettings, caches: Record<string, SourceCache>): string | undefined {
  const failed = settings.sources.filter(source => source.enabled && !!source.url.trim() && !!caches[source.id]?.error);
  if (!failed.length) return undefined;
  const reasons = [...new Set(failed.map(source => safeSubscriptionError(caches[source.id].error)))].filter(Boolean);
  return `${failed.length} ${failed.length === 1 ? 'subscription' : 'subscriptions'} failed to refresh: ${reasons.join(' ')} Open subscription settings for details.`;
}
