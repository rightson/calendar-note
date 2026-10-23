import { ICalError, ICalParser, type CalendarRange } from "./ical";
import { emptySourceCache, safeSourceError, type SourceCache } from "./history";
import type { CalendarSource, CalendarEvent } from "./types";
import type { CalendarStore } from "./store";
import type { SourceSyncService } from "./sync";
import type { StoredState } from "./state";

export interface RequestResponse {
  status: number;
  text?: string;
  headers?: Record<string, string>;
}

export type RequestAdapter = (url: string, headers: Record<string, string>) => Promise<RequestResponse>;
export type SourceStatus = Pick<SourceCache, "lastAttempt" | "lastSuccess" | "error" | "retryAfter" | "failures">;

export function subscriptionUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    const normalized = /^webcal:\/\//i.test(trimmed) ? `https://${trimmed.slice(9)}` : trimmed;
    const parsed = new URL(normalized);
    if (parsed.protocol !== "https:" || !parsed.hostname) return null;
    parsed.hash = "";
    return parsed.toString();
  } catch { return null; }
}

function header(headers: Record<string, string> | undefined, key: string): string | undefined {
  return Object.entries(headers ?? {}).find(([name]) => name.toLowerCase() === key.toLowerCase())?.[1];
}

function retryDelay(failures: number): number {
  return Math.min(60 * 60_000, 60_000 * 2 ** Math.min(Math.max(0, failures - 1), 6));
}

async function urlFingerprint(url: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(url));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

interface SourceGuard {
  sourceId: string;
  configuredUrl: string;
  normalizedUrl: string | null;
  generation: number;
}

export class SubscriptionService {
  private range?: CalendarRange;
  private timer?: ReturnType<typeof setInterval>;
  private refreshQueue: Promise<unknown> = Promise.resolve();
  private generation = 0;
  private disposed = false;

  constructor(
    public readonly store: CalendarStore,
    public readonly sync: SourceSyncService,
    private readonly request: RequestAdapter,
    private readonly parser = new ICalParser(),
  ) {}

  private trackedIds(sourceId: string): Set<string> {
    const accepted = Object.keys(this.store.state.sourceCaches[sourceId]?.accepted ?? {});
    const prefix = `ical|${sourceId.length}:${sourceId}|`;
    const linked = Object.keys(this.store.state.noteLinks).filter(id => id.startsWith(prefix));
    return new Set([...accepted, ...linked]);
  }

  private guard(source: CalendarSource): SourceGuard {
    return {
      sourceId: source.id,
      configuredUrl: source.url.trim(),
      normalizedUrl: subscriptionUrl(source.url),
      generation: this.generation,
    };
  }

  private isCurrent(guard: SourceGuard, state: StoredState = this.store.state): boolean {
    if (this.disposed || this.generation !== guard.generation) return false;
    const current = state.settings.sources.find(source => source.id === guard.sourceId);
    return !!current?.enabled && current.url.trim() === guard.configuredUrl
      && subscriptionUrl(current.url) === guard.normalizedUrl;
  }

  async setRange(range: CalendarRange): Promise<void> {
    const run = this.refreshQueue.then(async () => {
      if (this.disposed) return;
      this.range = range;
      for (const source of this.store.state.settings.sources) {
        const guard = this.guard(source);
        const cache = this.store.state.sourceCaches[source.id];
        if (!guard.configuredUrl || !guard.normalizedUrl || !cache?.raw || !this.isCurrent(guard)) continue;
        try {
          const fingerprint = await urlFingerprint(guard.normalizedUrl);
          if (!this.isCurrent(guard) || cache.urlFingerprint !== fingerprint) continue;
          const events = this.parser.parse(cache.raw, source.id, range, this.store.state.settings.timeZone, this.trackedIds(source.id));
          if (!this.isCurrent(guard)) continue;
          await this.sync.accept(source, events, range, state => this.isCurrent(guard, state));
        } catch (error) {
          await this.fail(guard, error instanceof ICalError && error.kind === "zone" ? "zone" : "parse",
            new Date().toISOString(), cache.urlFingerprint);
        }
      }
    });
    this.refreshQueue = run.then(() => undefined, () => undefined);
    await run;
  }

  getEvents(range: CalendarRange = this.range ?? { start: new Date(0).toISOString(), end: new Date(8640000000000000).toISOString() }): CalendarEvent[] {
    const shown = new Set(this.store.state.settings.sources.filter(source => source.enabled).map(source => source.id));
    return Object.values(this.store.state.sourceCaches)
      .flatMap(cache => Object.values(cache.accepted ?? {}).map(item => item.event))
      .filter(event => shown.has(event.sourceId))
      .map(event => this.sync.effectiveEvent(event))
      .filter(event => Date.parse(event.start) < Date.parse(range.end) && Date.parse(event.end) > Date.parse(range.start))
      .sort((a, b) => Date.parse(a.start) - Date.parse(b.start) || a.id.localeCompare(b.id));
  }

  getSourceStatus(sourceId: string): SourceStatus {
    const cache = this.store.state.sourceCaches[sourceId] ?? emptySourceCache();
    return {
      failures: cache.failures, lastAttempt: cache.lastAttempt,
      lastSuccess: cache.lastSuccess, retryAfter: cache.retryAfter, error: cache.error,
    };
  }

  start(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.generation++;
    this.disposed = false;
    const minutes = Math.max(1, this.store.state.settings.syncIntervalMinutes || 15);
    this.timer = setInterval(() => {
      if (this.range) void this.refresh(this.range).catch(() => undefined);
    }, minutes * 60_000);
  }

  dispose(): void {
    this.generation++;
    this.disposed = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  refresh(range: CalendarRange, options: { force?: boolean } = {}): Promise<void> {
    const run = this.refreshQueue.then(async () => {
      if (this.disposed) return;
      this.range = range;
      for (const source of this.store.state.settings.sources) {
        if (this.disposed) return;
        await this.refreshSource(source, range, options.force ?? false);
      }
    });
    this.refreshQueue = run.then(() => undefined, () => undefined);
    return run;
  }

  private async refreshSource(source: CalendarSource, range: CalendarRange, force: boolean): Promise<void> {
    const guard = this.guard(source);
    if (!guard.configuredUrl || !this.isCurrent(guard)) return;
    const url = guard.normalizedUrl;
    if (!url) {
      const prior = this.store.state.sourceCaches[source.id];
      if (!force && prior?.retryFingerprint === undefined && prior?.retryAfter
        && Date.parse(prior.retryAfter) > Date.now()) return;
      await this.fail(guard, "url");
      return;
    }
    const cache = this.store.state.sourceCaches[source.id] ?? emptySourceCache();
    const at = new Date().toISOString();
    let fingerprint: string | undefined;
    try {
      fingerprint = await urlFingerprint(url);
      if (!this.isCurrent(guard)) return;
      const sameEndpoint = cache.urlFingerprint === fingerprint;
      if (!force) {
        if (cache.retryFingerprint === fingerprint && cache.retryAfter && Date.parse(cache.retryAfter) > Date.now()) return;
      }
      if (!force && sameEndpoint) {
        const interval = Math.max(1, this.store.state.settings.syncIntervalMinutes || 15) * 60_000;
        if (cache.lastSuccess && Date.parse(cache.lastSuccess) + interval > Date.now()) return;
      }
      const headers: Record<string, string> = {};
      if (sameEndpoint && cache.etag) headers["If-None-Match"] = cache.etag;
      if (sameEndpoint && cache.lastModified) headers["If-Modified-Since"] = cache.lastModified;
      const response = await this.request(url, headers);
      if (!this.isCurrent(guard)) return;
      if (response.status === 304) {
        if (!sameEndpoint || !cache.raw) throw new ICalError("parse", "304 without cached feed.");
        const events = this.parser.parse(cache.raw, source.id, range, this.store.state.settings.timeZone, this.trackedIds(source.id));
        if (!this.isCurrent(guard)) return;
        await this.sync.accept(source, events, range, state => this.isCurrent(guard, state));
        if (!this.isCurrent(guard)) return;
        await this.store.commit([], state => {
          if (!this.isCurrent(guard, state)) return;
          const target = state.sourceCaches[source.id] ??= emptySourceCache();
          target.lastAttempt = at;
          target.lastSuccess = at;
          target.failures = 0;
          target.retryAfter = undefined;
          target.retryFingerprint = undefined;
          target.error = undefined;
        });
        return;
      }
      if (response.status !== 200 || !response.text) throw new Error("Fetch failed.");
      const events = this.parser.parse(response.text, source.id, range, this.store.state.settings.timeZone, this.trackedIds(source.id));
      if (!this.isCurrent(guard)) return;
      await this.store.commit([], state => {
        if (!this.isCurrent(guard, state)) return;
        const target = state.sourceCaches[source.id] ??= emptySourceCache();
        target.raw = response.text;
        target.urlFingerprint = fingerprint;
        target.etag = header(response.headers, "etag");
        target.lastModified = header(response.headers, "last-modified");
        target.lastAttempt = at;
        target.lastSuccess = at;
        target.failures = 0;
        target.retryAfter = undefined;
        target.retryFingerprint = undefined;
        target.error = undefined;
      });
      if (!this.isCurrent(guard)) return;
      await this.sync.accept(source, events, range, state => this.isCurrent(guard, state));
    } catch (error) {
      await this.fail(guard, error instanceof ICalError
        ? error.kind === "zone" ? "zone" : "parse" : "fetch", at, fingerprint);
    }
  }

  private async fail(guard: SourceGuard, kind: "url" | "fetch" | "parse" | "zone",
    at = new Date().toISOString(), fingerprint?: string): Promise<void> {
    if (!this.isCurrent(guard)) return;
    await this.store.commit([], state => {
      if (!this.isCurrent(guard, state)) return;
      const cache = state.sourceCaches[guard.sourceId] ??= emptySourceCache();
      cache.lastAttempt = at;
      cache.failures++;
      cache.retryAfter = new Date(Date.parse(at) + retryDelay(cache.failures)).toISOString();
      cache.retryFingerprint = fingerprint;
      cache.error = safeSourceError(kind);
    });
  }
}
