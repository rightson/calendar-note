export type ICalErrorCode =
  | "invalid-feed"
  | "invalid-syntax"
  | "invalid-range"
  | "feed-too-large"
  | "invalid-time-zone"
  | "invalid-event-time"
  | "missing-event-uid"
  | "duplicate-event-uid"
  | "orphan-recurrence"
  | "missing-event-start"
  | "duplicate-recurrence"
  | "invalid-event-interval"
  | "recurrence-limit"
  | "unsupported-calendar-update";

export class ICalError extends Error {
  readonly code: ICalErrorCode;

  constructor(
    public readonly kind: "parse" | "zone" | "limit",
    message: string,
    code: ICalErrorCode = kind === "zone" ? "invalid-time-zone" : kind === "limit" ? "recurrence-limit" : "invalid-syntax",
  ) {
    super(message);
    this.name = "ICalError";
    this.code = code;
  }
}
