import ICAL from "ical.js";
import moment from "moment-timezone";
import type { CalendarEvent } from "./types";
import { ICalError } from "./ical-errors";
export { ICalError } from "./ical-errors";
export type { ICalErrorCode } from "./ical-errors";

export interface CalendarRange {
  start: string;
  /** Exclusive ISO instant. */
  end: string;
}

type ITime = InstanceType<typeof ICAL.Time>;
type IProperty = InstanceType<typeof ICAL.Property>;
type IEvent = InstanceType<typeof ICAL.Event>;
type IPeriod = InstanceType<typeof ICAL.Period>;

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
  if (!moment.tz.zone(effectiveZone)) throw new ICalError("zone", "Unknown iCalendar time zone.", "invalid-time-zone");
  const value = moment.tz(wall(time), effectiveZone).valueOf();
  if (!Number.isFinite(value)) throw new ICalError("parse", "Invalid iCalendar date.", "invalid-event-time");
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
  explicitEnd: boolean,
): Pick<CalendarEvent, "start" | "end" | "allDay"> {
  const from = timeToMillis(start, startZone, displayZone, embedded);
  const to = timeToMillis(end, endZone ?? startZone, displayZone, embedded);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from || (to === from && (start.isDate || explicitEnd))) {
    throw new ICalError("parse", "Event end must be after start.", "invalid-event-interval");
  }
  return { start: isoAt(from, displayZone), end: isoAt(to, displayZone), allDay: start.isDate };
}

/** A timed point event belongs to the range containing its instant. */
export function intersectsRange(event: Pick<CalendarEvent, "start" | "end">, range: CalendarRange): boolean {
  const start = Date.parse(event.start);
  const end = Date.parse(event.end);
  const rangeStart = Date.parse(range.start);
  return start < Date.parse(range.end)
    && (end > rangeStart || (end === start && start >= rangeStart));
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

/** Keep a stream's object boundaries; ical.js parses only one VCALENDAR. */
function splitCalendars(raw: string): string[] {
  const lines = raw.replace(/\r\n?/g, "\n").split("\n");
  const calendars: string[] = [];
  let current: string[] | undefined;
  for (const line of lines) {
    if (!current) {
      // Transport padding is harmless outside objects. Never trim a content line.
      if (/^[\t ]*$/.test(line)) continue;
      const boundary = line.charCodeAt(0) === 0xFEFF ? line.slice(1) : line;
      if (!/^BEGIN:VCALENDAR$/i.test(boundary)) throw new ICalError("parse", "Invalid iCalendar feed.", "invalid-feed");
      current = [boundary];
    } else {
      if (/^BEGIN:VCALENDAR$/i.test(line)) throw new ICalError("parse", "Invalid iCalendar feed.", "invalid-feed");
      current.push(line);
      if (/^END:VCALENDAR$/i.test(line)) {
        calendars.push(current.join("\r\n") + "\r\n");
        current = undefined;
      }
    }
  }
  if (current || calendars.length === 0) throw new ICalError("parse", "Invalid iCalendar feed.", "invalid-feed");
  return calendars;
}

interface PeriodOccurrence {
  end: ITime;
  zone: string | undefined;
}

/** ical.js expands PERIOD as a Period object rather than an occurrence Time. */
function normalizePeriodDates(component: InstanceType<typeof ICAL.Component>, baseZone: string | undefined,
  displayZone: string, embedded: Set<string>): Map<string, PeriodOccurrence> {
  const periods = new Map<string, PeriodOccurrence>();
  for (const property of component.getAllProperties("rdate")) {
    if (property.type !== "period") continue;
    const zone = propertyZone(property) ?? baseZone;
    const starts: ITime[] = [];
    for (const value of property.getValues() as IPeriod[]) {
      const start = value.start;
      const end = value.getEnd();
      intervalFor(start, end, zone, zone, displayZone, embedded, true);
      const key = anchor(start, zone, displayZone, embedded);
      const prior = periods.get(key);
      if (prior && anchor(prior.end, prior.zone, displayZone, embedded) !== anchor(end, zone, displayZone, embedded)) {
        throw new ICalError("parse", "Ambiguous duplicate recurrence period.", "duplicate-recurrence");
      }
      periods.set(key, { end, zone });
      // Normalize the iterator value to UTC: ical.js loses an RDATE's TZID
      // when no VTIMEZONE is embedded, even when the zone is known to us.
      starts.push(ICAL.Time.fromJSDate(new Date(timeToMillis(start, zone, displayZone, embedded)), true));
    }
    const dates = new ICAL.Property("rdate");
    dates.setValues(starts);
    component.removeProperty(property);
    component.addProperty(dates);
  }
  return periods;
}

type IComponent = InstanceType<typeof ICAL.Component>;
interface EventGroup { master?: IComponent; exceptions: IComponent[] }

/** Registers embedded zones and returns the calendar's VEVENTs. */
function readCalendar(raw: string, embedded: Set<string>): IComponent[] {
  let calendar: IComponent;
  try {
    const parsed: unknown = ICAL.parse(raw);
    if (!Array.isArray(parsed)) throw new Error("Not a calendar component.");
    calendar = new ICAL.Component(parsed);
    if (calendar.name !== "vcalendar") throw new Error("Not a calendar.");
  } catch {
    throw new ICalError("parse", "Invalid iCalendar syntax.", "invalid-syntax");
  }

  // iTIP CANCEL is a change message, not a replacement subscription snapshot.
  if (String(calendar.getFirstPropertyValue("method") ?? "").toUpperCase() === "CANCEL") {
    throw new ICalError("parse", "Cancellation update cannot be applied as a calendar snapshot.", "unsupported-calendar-update");
  }

  for (const component of calendar.getAllSubcomponents("vtimezone")) {
    const tzid = component.getFirstPropertyValue("tzid");
    if (typeof tzid !== "string" || !tzid) throw new ICalError("zone", "Invalid VTIMEZONE.", "invalid-time-zone");
    ICAL.TimezoneService.register(component);
    embedded.add(tzid);
  }
  return calendar.getAllSubcomponents("vevent");
}

/** A stream may split a series across calendar objects, so group by UID over the whole feed. */
function groupByUid(components: IComponent[], embedded: Set<string>): Map<string, EventGroup> {
  const byUid = new Map<string, EventGroup>();
  for (const component of components) {
    const uid = component.getFirstPropertyValue("uid");
    if (typeof uid !== "string" || !uid) throw new ICalError("parse", "VEVENT lacks UID.", "missing-event-uid");
    for (const key of ["dtstart", "dtend", "recurrence-id", "rdate", "exdate"]) {
      for (const prop of component.getAllProperties(key)) {
        const zone = propertyZone(prop);
        if (zone && zone !== "UTC" && !embedded.has(zone) && !moment.tz.zone(zone)) {
          throw new ICalError("zone", "Unknown iCalendar time zone.", "invalid-time-zone");
        }
      }
    }
    const group = byUid.get(uid) ?? { exceptions: [] };
    if (component.hasProperty("recurrence-id")) group.exceptions.push(component);
    else {
      if (group.master) throw new ICalError("parse", "Ambiguous duplicate UID.", "duplicate-event-uid");
      group.master = component;
    }
    byUid.set(uid, group);
  }
  return byUid;
}

/**
 * Providers publish a lone occurrence when the user is invited to only that
 * instance or the series start predates the exported window.
 */
function addOrphanOccurrences(
  uid: string,
  exceptions: IComponent[],
  sourceId: string,
  range: CalendarRange,
  displayZone: string,
  embedded: Set<string>,
  trackedIds: ReadonlySet<string>,
  result: Map<string, CalendarEvent>,
): void {
  const from = Date.parse(range.start);
  const to = Date.parse(range.end);
  const anchors = new Set<string>();
  for (const component of exceptions) {
    const exception = new ICAL.Event(component);
    const recProp = component.getFirstProperty("recurrence-id");
    const recZone = propertyZone(recProp);
    const recurrenceId = anchor(exception.recurrenceId, recZone, displayZone, embedded);
    if (anchors.has(recurrenceId)) throw new ICalError("parse", "Ambiguous duplicate recurrence exception.", "duplicate-recurrence");
    anchors.add(recurrenceId);
    // Without its series there is nothing for a cancellation to remove.
    if (String(component.getFirstPropertyValue("status") ?? "").toUpperCase() === "CANCELLED") continue;
    const hasStart = component.hasProperty("dtstart");
    const eventStart = hasStart ? exception.startDate : exception.recurrenceId;
    let eventEnd: ITime;
    if (hasStart) eventEnd = exception.endDate;
    else {
      eventEnd = eventStart.clone();
      if (eventEnd.isDate) eventEnd.day += 1;
    }
    const startZone = hasStart ? propertyZone(component.getFirstProperty("dtstart")) : recZone;
    const fields = intervalFor(eventStart, eventEnd, startZone,
      propertyZone(component.getFirstProperty("dtend")) ?? startZone, displayZone, embedded, component.hasProperty("dtend"));
    const event = eventFields(exception, sourceId, recurrenceId, fields);
    const anchorMs = timeToMillis(exception.recurrenceId, recZone, displayZone, embedded);
    if (intersectsRange(event, range) || trackedIds.has(event.id) || (anchorMs >= from && anchorMs < to)) {
      result.set(event.id, event);
    }
  }
}

/**
 * Expand a bounded visible range. trackedIds keeps existing linked occurrences
 * available when a source moves one outside the current view.
 */
function expandGroups(
  byUid: Map<string, EventGroup>,
  sourceId: string,
  range: CalendarRange,
  displayZone: string,
  embedded: Set<string>,
  trackedIds: ReadonlySet<string>,
): CalendarEvent[] {
  const from = Date.parse(range.start);
  const to = Date.parse(range.end);
  const result = new Map<string, CalendarEvent>();
  for (const [uid, group] of byUid) {
    if (!group.master) {
      addOrphanOccurrences(uid, group.exceptions, sourceId, range, displayZone, embedded, trackedIds, result);
      continue;
    }
    if (!group.master.hasProperty("dtstart")) {
      throw new ICalError("parse", "VEVENT lacks DTSTART.", "missing-event-start");
    }
    const baseZone = propertyZone(group.master.getFirstProperty("dtstart"));
    const periods = normalizePeriodDates(group.master, baseZone, displayZone, embedded);
    // ical.js's RDATE-only iterator omits DTSTART unless it is also an RDATE.
    // DTSTART is part of the recurrence set even without an RRULE.
    if (group.master.hasProperty("rdate") && !group.master.hasProperty("rrule")) {
      const start = group.master.getFirstPropertyValue("dtstart") as ITime;
      const startAnchor = anchor(start, baseZone, displayZone, embedded);
      const hasStart = group.master.getAllProperties("rdate").some(property =>
        property.getValues().some(value => anchor(value as ITime,
          propertyZone(property) ?? baseZone, displayZone, embedded) === startAnchor));
      if (!hasStart) {
        const property = new ICAL.Property("rdate");
        if (baseZone) property.setParameter("tzid", baseZone);
        property.setValue(start);
        group.master.addProperty(property);
      }
    }
    const master = new ICAL.Event(group.master, { exceptions: group.exceptions, strictExceptions: true });
    const baseEndZone = propertyZone(master.component.getFirstProperty("dtend")) ?? baseZone;
    const baseFields = intervalFor(master.startDate, master.endDate, baseZone, baseEndZone, displayZone, embedded,
      master.component.hasProperty("dtend"));
    const exceptionAnchors = new Set<string>();
    const exceptionByAnchor = new Map<string, IEvent>();
    for (const component of group.exceptions) {
      const exception = new ICAL.Event(component);
      const rec = anchor(exception.recurrenceId,
        propertyZone(component.getFirstProperty("recurrence-id")) ?? baseZone, displayZone, embedded);
      if (exceptionAnchors.has(rec)) throw new ICalError("parse", "Ambiguous duplicate recurrence exception.", "duplicate-recurrence");
      exceptionAnchors.add(rec);
      exceptionByAnchor.set(rec, exception);
    }
    if (!master.isRecurring() && group.exceptions.length === 0) {
      const event = eventFields(master, sourceId, undefined, baseFields);
      if (intersectsRange(event, range) || trackedIds.has(event.id)) result.set(event.id, event);
      continue;
    }

    const iterator = master.iterator();
    const cutoff = Math.max(to, trackedCutoff(trackedIds, sourceId, uid, displayZone));
    let count = 0;
    let occurrence: ITime | null;
    while ((occurrence = iterator.next())) {
      if (++count > MAX_OCCURRENCES) throw new ICalError("limit", "Recurrence expansion limit exceeded.", "recurrence-limit");
      const recurrenceId = anchor(occurrence, baseZone, displayZone, embedded);
      const id = sourceEventId(sourceId, uid, recurrenceId);
      const bareCancellation = exceptionByAnchor.get(recurrenceId);
      const details = bareCancellation && !bareCancellation.component.hasProperty("dtstart")
        ? { item: bareCancellation, startDate: occurrence, endDate: undefined }
        : master.getOccurrenceDetails(occurrence);
      const item = details.item;
      const startZone = propertyZone(item.component.getFirstProperty("dtstart")) ?? baseZone;
      const endZone = propertyZone(item.component.getFirstProperty("dtend")) ?? startZone;
      const eventStart = details.startDate ?? occurrence;
      const inheritedEnd = eventStart.clone();
      inheritedEnd.addDuration(master.duration);
      const period = item === master ? periods.get(recurrenceId) : undefined;
      const eventEnd = period?.end ?? (!item.component.hasProperty("dtend") && !item.component.hasProperty("duration")
        ? inheritedEnd : details.endDate ?? inheritedEnd);
      const fields = intervalFor(eventStart, eventEnd, startZone, period?.zone ?? endZone, displayZone, embedded,
        !!period || item.component.hasProperty("dtend"));
      const event = eventFields(item, sourceId, recurrenceId, fields, master);
      const anchorMs = timeToMillis(occurrence, baseZone, displayZone, embedded);
      if (intersectsRange(event, range) || trackedIds.has(id) || (anchorMs >= from && anchorMs < to)) result.set(id, event);
      // Exception anchors can lie beyond the visible range; they are handled below.
      if (anchorMs > cutoff && count > 1) break;
    }

    for (const exceptionComponent of group.exceptions) {
      const exception = new ICAL.Event(exceptionComponent);
      const recProp = exceptionComponent.getFirstProperty("recurrence-id");
      const recurrenceId = anchor(exception.recurrenceId, propertyZone(recProp) ?? baseZone, displayZone, embedded);
      const id = sourceEventId(sourceId, uid, recurrenceId);
      const eventStart = exceptionComponent.hasProperty("dtstart") ? exception.startDate : exception.recurrenceId;
      const inheritedEnd = eventStart.clone();
      inheritedEnd.addDuration(master.duration);
      const eventEnd = exceptionComponent.hasProperty("dtend") || exceptionComponent.hasProperty("duration")
        ? exception.endDate : inheritedEnd;
      const fields = intervalFor(
        eventStart, eventEnd,
        propertyZone(exceptionComponent.getFirstProperty("dtstart")) ?? baseZone,
        propertyZone(exceptionComponent.getFirstProperty("dtend")) ?? baseEndZone,
        displayZone, embedded, exceptionComponent.hasProperty("dtend"),
      );
      const event = eventFields(exception, sourceId, recurrenceId, fields, master);
      const anchorMs = timeToMillis(exception.recurrenceId,
        propertyZone(recProp) ?? baseZone, displayZone, embedded);
      if (intersectsRange(event, range) || trackedIds.has(id) || (anchorMs >= from && anchorMs < to)) result.set(id, event);
    }
  }
  return [...result.values()];
}

export function parseICalendar(
  raw: string,
  sourceId: string,
  range: CalendarRange,
  displayZone: string,
  trackedIds: ReadonlySet<string> = new Set(),
): CalendarEvent[] {
  try {
    if (!sourceId || !moment.tz.zone(displayZone)) throw new ICalError("zone", "Unknown display time zone.", "invalid-time-zone");
    const from = Date.parse(range.start);
    const to = Date.parse(range.end);
    if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) {
      throw new ICalError("parse", "Invalid calendar range.", "invalid-range");
    }
    if (raw.length > MAX_FEED_BYTES) throw new ICalError("limit", "iCalendar feed exceeds size limit.", "feed-too-large");
    const embedded = new Set<string>();
    const components = splitCalendars(raw).flatMap(calendar => readCalendar(calendar, embedded));
    const events = expandGroups(groupByUid(components, embedded), sourceId, range, displayZone, embedded, trackedIds);
    return events.sort((a, b) => Date.parse(a.start) - Date.parse(b.start) || a.id.localeCompare(b.id));
  } catch (error) {
    if (error instanceof ICalError) throw error;
    throw new ICalError("parse", "Invalid iCalendar syntax.", "invalid-syntax");
  }
}

export class ICalParser {
  parse(raw: string, sourceId: string, range: CalendarRange, displayZone: string, trackedIds?: ReadonlySet<string>): CalendarEvent[] {
    return parseICalendar(raw, sourceId, range, displayZone, trackedIds);
  }
}
