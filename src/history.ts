import type { CalendarEvent } from "./types";

export type Interval = Pick<CalendarEvent, "start" | "end" | "allDay">;
export type ChangeStatus =
  | "applied"
  | "local_override"
  | "needs_attention"
  | "superseded"
  | "cancelled"
  | "removal_attention"
  | "resolved";

export interface ChangeHistoryEntry {
  id: string;
  eventId: string;
  sourceId: string;
  sourceName: string;
  title: string;
  detectedAt: string;
  reviewedAt?: string;
  status: ChangeStatus;
  beforeSource?: Interval;
  afterSource?: Interval;
  beforeEffective?: Interval;
  afterEffective?: Interval;
  notePath?: string;
  beforeDailyPath?: string;
  afterDailyPath?: string;
  resolutionAt?: string;
  resolution?: "source_times";
  error?: string;
  /** Revision of the accepted baseline when this change was detected. */
  acceptedRevision: number;
}

export interface AcceptedEvent {
  event: CalendarEvent;
  revision: number;
}

export interface PendingIncoming {
  event: CalendarEvent;
  baselineRevision: number;
  historyId: string;
}

export interface SourceCache {
  /** Private feed data. Never copy this into notes, history, notices, or logs. */
  raw?: string;
  /** Hash of the configured URL so validators never cross endpoint changes. */
  urlFingerprint?: string;
  etag?: string;
  lastModified?: string;
  lastAttempt?: string;
  lastSuccess?: string;
  error?: string;
  retryAfter?: string;
  retryFingerprint?: string;
  failures: number;
  accepted: Record<string, AcceptedEvent>;
  pendingIncoming: Record<string, PendingIncoming>;
}

export function emptySourceCache(): SourceCache {
  return { failures: 0, accepted: {}, pendingIncoming: {} };
}

export function needsReview(entry: ChangeHistoryEntry): boolean {
  return entry.status === "needs_attention" || !entry.reviewedAt;
}

export function historyForReview(history: readonly ChangeHistoryEntry[]): ChangeHistoryEntry[] {
  return history.filter(needsReview);
}

export function markReviewed(history: ChangeHistoryEntry[], id: string, at = new Date().toISOString()): boolean {
  const entry = history.find((item) => item.id === id);
  if (!entry) return false;
  entry.reviewedAt ??= at;
  return true;
}

/** Error text shown to users must not reveal URL credentials or feed content. */
export function safeSourceError(kind: "url" | "fetch" | "parse" | "zone" | "write"): string {
  switch (kind) {
    case "url": return "Enter a valid HTTPS or webcal subscription URL.";
    case "fetch": return "Could not refresh this calendar. Cached events remain available.";
    case "parse": return "The calendar response is not a valid iCalendar feed. Cached events remain available.";
    case "zone": return "The calendar uses an unknown time zone. Cached events remain available.";
    case "write": return "The linked note could not be updated. Review or retry this change.";
  }
}
