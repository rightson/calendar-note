import ICAL from "ical.js";
import moment from "moment-timezone";
import type { CalendarEvent } from "./types";

export interface CalendarRange {
  start: string;
  /** Exclusive ISO instant. */
  end: string;
}

export class ICalError extends Error {
  constructor(public readonly kind: "parse" | "zone" | "limit", message: string) {
    super(message);
    this.name = "ICalError";
  }
}

type ITime = InstanceType<typeof ICAL.Time>;
type IProperty = InstanceType<typeof ICAL.Property>;
type IEvent = InstanceType<typeof ICAL.Event>;

const MAX_OCCURRENCES = 50_000;
const MAX_FEED_BYTES = 8_000_000;

/** Length-prefixed segments cannot collide even if a UID contains separators. */
export function sourceEventId(sourceId: string, uid: string, recurrenceId?: string): string {
  const part = (value: string) => `${value.length}:${value}`;
  return `ical|${part(sourceId)}|${part(uid)}${recurrenceId === undefined ? "" : `|${part(recurrenceId)}`}`;
}

function wall(time: ITime): number[] {
  return [time.year, time.month - 1, time.day, time.hour, time.minute, time.second];
}

function propertyZone(prop?: IProperty | null): string | undefined {
  const value = prop?.getParameter("tzid");
  return typeof value === "string" ? value : undefined;
}

function timeToMillis(time: ITime, zone: string | undefined, displayZone: string, embedded: Set<string>): number {
  if (time.isDate) {
    return moment.tz([time.year, time.month - 1, time.day], displayZone).valueOf();
  }
  if (time.toString().endsWith("Z") || zone === "UTC" || zone === "Etc/UTC") return time.toUnixTime() * 1000;
  const effectiveZone = zone ?? displayZone;
  if (embedded.has(effectiveZone)) return time.toUnixTime() * 1000;
  if (!moment.tz.zone(effectiveZone)) throw new ICalError("zone", "Unknown iCalendar time zone.");
  const value = moment.tz(wall(time), effectiveZone).valueOf();
  if (!Number.isFinite(value)) throw new ICalError("zone", "Invalid iCalendar date.");
  return value;
}

function isoAt(ms: number, displayZone: string): string {
  return moment.tz(ms, displayZone).format("YYYY-MM-DDTHH:mm:ssZ");
}

function anchor(time: ITime, zone: string | undefined, displayZone: string, embedded: Set<string>): string {
  if (time.isDate) return `DATE:${time.year.toString().padStart(4, "0")}-${String(time.month).padStart(2, "0")}-${String(time.day).padStart(2, "0")}`;
  return new Date(timeToMillis(time, zone, displayZone, embedded)).toISOString();
}

function trackedCutoff(trackedIds: ReadonlySet<string>, sourceId: string, uid: string, displayZone: string): number {
  const prefix = sourceEventId(sourceId, uid);
  let cutoff = -Infinity;
  for (const id of trackedIds) {
    if (!id.startsWith(prefix + "|")) continue;
    const encoded = id.slice(prefix.length + 1);
    const colon = encoded.indexOf(":");
    const length = Number(encoded.slice(0, colon));
    if (!Number.isInteger(length) || length < 0) continue;
    const value = encoded.slice(colon + 1, colon + 1 + length);
    const instant = value.startsWith("DATE:")
      ? moment.tz(value.slice(5), "YYYY-MM-DD", displayZone).valueOf()
      : Date.parse(value);
    if (Number.isFinite(instant)) cutoff = Math.max(cutoff, instant);
  }
  return cutoff;
}

function intervalFor(
  start: ITime,
  end: ITime,
  startZone: string | undefined,
  endZone: string | undefined,
  displayZone: string,
  embedded: Set<string>,
): Pick<CalendarEvent, "start" | "end" | "allDay"> {
  const from = timeToMillis(start, startZone, displayZone, embedded);
  const to = timeToMillis(end, endZone ?? startZone, displayZone, embedded);
  if (!(to > from)) throw new ICalError("parse", "Event end must be after start.");
  return { start: isoAt(from, displayZone), end: isoAt(to, displayZone), allDay: start.isDate };
}

function intersects(event: CalendarEvent, range: CalendarRange): boolean {
  return Date.parse(event.start) < Date.parse(range.end) && Date.parse(event.end) > Date.parse(range.start);
}

function eventFields(event: IEvent, sourceId: string, recurrenceId: string | undefined,
  range: Pick<CalendarEvent, "start" | "end" | "allDay">, base: IEvent = event): CalendarEvent {
  const value = (key: string) => event.component.getFirstPropertyValue(key) ?? base.component.getFirstPropertyValue(key);
  const sequence = value("sequence");
  const status = String(event.component.getFirstPropertyValue("status") ?? "").toUpperCase() === "CANCELLED" ? "cancelled" : "active";
  return {
    id: sourceEventId(sourceId, event.uid, recurrenceId),
    sourceId,
    uid: event.uid,
    ...(recurrenceId !== undefined ? { recurrenceId } : {}),
    title: String(value("summary") ?? "Untitled event"),
    ...range,
    ...(typeof sequence === "number" ? { sequence } : {}),
    status,
    ...(value("location") != null ? { location: String(value("location")) } : {}),
    ...(value("description") != null ? { description: String(value("description")) } : {}),
  };
}

/**
 * Parse a bounded visible range. trackedIds keeps existing linked occurrences
 * available when a source moves one outside the current view.
 */
export function parseICalendar(
  raw: string,
  sourceId: string,
  range: CalendarRange,
  displayZone: string,
  trackedIds: ReadonlySet<string> = new Set(),
): CalendarEvent[] {
  if (!sourceId || !moment.tz.zone(displayZone)) throw new ICalError("zone", "Unknown display time zone.");
  const from = Date.parse(range.start);
  const to = Date.parse(range.end);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) throw new ICalError("parse", "Invalid calendar range.");
  if (raw.length > MAX_FEED_BYTES || !/BEGIN:VCALENDAR/i.test(raw) || !/END:VCALENDAR/i.test(raw)) {
    throw new ICalError("parse", "Invalid iCalendar feed.");
  }
  let calendar: InstanceType<typeof ICAL.Component>;
  try {
    const parsed: unknown = ICAL.parse(raw);
    if (!Array.isArray(parsed)) throw new Error("Not a calendar component.");
    calendar = new ICAL.Component(parsed);
    if (calendar.name !== "vcalendar") throw new Error("Not a calendar.");
  } catch {
    throw new ICalError("parse", "Invalid iCalendar feed.");
  }

  const embedded = new Set<string>();
  for (const component of calendar.getAllSubcomponents("vtimezone")) {
    const tzid = component.getFirstPropertyValue("tzid");
    if (typeof tzid !== "string" || !tzid) throw new ICalError("zone", "Invalid VTIMEZONE.");
    ICAL.TimezoneService.register(component);
    embedded.add(tzid);
  }
  const components = calendar.getAllSubcomponents("vevent");
  const byUid = new Map<string, { master?: InstanceType<typeof ICAL.Component>; exceptions: InstanceType<typeof ICAL.Component>[] }>();
  for (const component of components) {
    const uid = component.getFirstPropertyValue("uid");
    if (typeof uid !== "string" || !uid) throw new ICalError("parse", "VEVENT lacks UID.");
    for (const key of ["dtstart", "dtend", "recurrence-id", "rdate", "exdate"]) {
      for (const prop of component.getAllProperties(key)) {
        const zone = propertyZone(prop);
        if (zone && zone !== "UTC" && !embedded.has(zone) && !moment.tz.zone(zone)) {
          throw new ICalError("zone", "Unknown iCalendar time zone.");
        }
      }
    }
    const group = byUid.get(uid) ?? { exceptions: [] };
    if (component.hasProperty("recurrence-id")) group.exceptions.push(component);
    else {
      if (group.master) throw new ICalError("parse", "Ambiguous duplicate UID.");
      group.master = component;
    }
    byUid.set(uid, group);
  }

  const result = new Map<string, CalendarEvent>();
  for (const [uid, group] of byUid) {
    if (!group.master) throw new ICalError("parse", "Orphan recurrence exception.");
    const master = new ICAL.Event(group.master, { exceptions: group.exceptions, strictExceptions: true });
    if (!master.component.hasProperty("dtstart")) throw new ICalError("parse", "VEVENT lacks DTSTART.");
    const baseZone = propertyZone(master.component.getFirstProperty("dtstart"));
    const baseEndZone = propertyZone(master.component.getFirstProperty("dtend")) ?? baseZone;
    const exceptionAnchors = new Set<string>();
    const exceptionByAnchor = new Map<string, IEvent>();
    for (const component of group.exceptions) {
      const exception = new ICAL.Event(component);
      const rec = anchor(exception.recurrenceId,
        propertyZone(component.getFirstProperty("recurrence-id")) ?? baseZone, displayZone, embedded);
      if (exceptionAnchors.has(rec)) throw new ICalError("parse", "Ambiguous duplicate recurrence exception.");
      exceptionAnchors.add(rec);
      exceptionByAnchor.set(rec, exception);
    }
    if (!master.isRecurring() && group.exceptions.length === 0) {
      const fields = intervalFor(master.startDate, master.endDate, baseZone, baseEndZone, displayZone, embedded);
      const event = eventFields(master, sourceId, undefined, fields);
      if (intersects(event, range) || trackedIds.has(event.id)) result.set(event.id, event);
      continue;
    }

    const iterator = master.iterator();
    const cutoff = Math.max(to, trackedCutoff(trackedIds, sourceId, uid, displayZone));
    let count = 0;
    let occurrence: ITime | null;
    while ((occurrence = iterator.next())) {
      if (++count > MAX_OCCURRENCES) throw new ICalError("limit", "Recurrence expansion limit exceeded.");
      const recurrenceId = anchor(occurrence, baseZone, displayZone, embedded);
      const id = sourceEventId(sourceId, uid, recurrenceId);
      const bareCancellation = exceptionByAnchor.get(recurrenceId);
      const details = bareCancellation && !bareCancellation.component.hasProperty("dtstart")
        ? { item: bareCancellation, startDate: occurrence, endDate: undefined }
        : master.getOccurrenceDetails(occurrence);
      const item = details.item;
      const startZone = propertyZone(item.component.getFirstProperty("dtstart")) ?? baseZone;
      const endZone = propertyZone(item.component.getFirstProperty("dtend")) ?? startZone;
      const fallbackEnd = occurrence.clone();
      fallbackEnd.addDuration(master.duration);
      const fields = intervalFor(details.startDate ?? occurrence, details.endDate ?? fallbackEnd,
        startZone, endZone, displayZone, embedded);
      const event = eventFields(item, sourceId, recurrenceId, fields, master);
      const anchorMs = timeToMillis(occurrence, baseZone, displayZone, embedded);
      if (intersects(event, range) || trackedIds.has(id) || (anchorMs >= from && anchorMs < to)) result.set(id, event);
      // Exception anchors can lie beyond the visible range; they are handled below.
      if (anchorMs > cutoff && count > 1) break;
    }

    for (const exceptionComponent of group.exceptions) {
      const exception = new ICAL.Event(exceptionComponent);
      const recProp = exceptionComponent.getFirstProperty("recurrence-id");
      const recurrenceId = anchor(exception.recurrenceId, propertyZone(recProp) ?? baseZone, displayZone, embedded);
      const id = sourceEventId(sourceId, uid, recurrenceId);
      const fallbackEnd = exception.recurrenceId.clone();
      fallbackEnd.addDuration(master.duration);
      const fields = intervalFor(
        exceptionComponent.hasProperty("dtstart") ? exception.startDate : exception.recurrenceId,
        exceptionComponent.hasProperty("dtstart") ? exception.endDate : fallbackEnd,
        propertyZone(exceptionComponent.getFirstProperty("dtstart")) ?? baseZone,
        propertyZone(exceptionComponent.getFirstProperty("dtend")) ?? baseEndZone,
        displayZone, embedded,
      );
      const event = eventFields(exception, sourceId, recurrenceId, fields, master);
      const anchorMs = timeToMillis(exception.recurrenceId,
        propertyZone(recProp) ?? baseZone, displayZone, embedded);
      if (intersects(event, range) || trackedIds.has(id) || (anchorMs >= from && anchorMs < to)) result.set(id, event);
    }
  }
  return [...result.values()].sort((a, b) => Date.parse(a.start) - Date.parse(b.start) || a.id.localeCompare(b.id));
}

export class ICalParser {
  parse(raw: string, sourceId: string, range: CalendarRange, displayZone: string, trackedIds?: ReadonlySet<string>): CalendarEvent[] {
    return parseICalendar(raw, sourceId, range, displayZone, trackedIds);
  }
}
