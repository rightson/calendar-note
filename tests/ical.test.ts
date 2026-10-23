import test from "node:test";
import assert from "node:assert/strict";
import { ICalError, parseICalendar, sourceEventId } from "../src/ical";

const range = { start: "2026-03-07T00:00:00Z", end: "2026-03-15T00:00:00Z" };
const feed = (body: string) => `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Calendar-Note tests//EN
${body.trim()}
END:VCALENDAR
`.replace(/\n/g, "\r\n");

test("RRULE, RDATE, EXDATE and moved exception retain original anchor across DST", () => {
  const raw = feed(`BEGIN:VEVENT
UID:recurring@example
SUMMARY:Meeting
DTSTART;TZID=America/New_York:20260307T090000
DTEND;TZID=America/New_York:20260307T100000
RRULE:FREQ=DAILY;COUNT=3
RDATE;TZID=America/New_York:20260312T090000
EXDATE;TZID=America/New_York:20260308T090000
END:VEVENT
BEGIN:VEVENT
UID:recurring@example
RECURRENCE-ID;TZID=America/New_York:20260309T090000
SUMMARY:Moved meeting
DTSTART;TZID=America/New_York:20260310T120000
DTEND;TZID=America/New_York:20260310T130000
SEQUENCE:2
END:VEVENT
BEGIN:VEVENT
UID:recurring@example
RECURRENCE-ID;TZID=America/New_York:20260312T090000
STATUS:CANCELLED
END:VEVENT`);
  const events = parseICalendar(raw, "team", range, "America/New_York");
  assert.equal(events.length, 3);
  assert.equal(events[0].start, "2026-03-07T09:00:00-05:00");
  assert.equal(events[0].end, "2026-03-07T10:00:00-05:00");
  const moved = events.find(event => event.title === "Moved meeting")!;
  assert.equal(moved.recurrenceId, "2026-03-09T13:00:00.000Z");
  assert.equal(moved.id, sourceEventId("team", "recurring@example", moved.recurrenceId));
  assert.equal(moved.start, "2026-03-10T12:00:00-04:00");
  assert.equal(moved.sequence, 2);
  const cancelled = events.find(event => event.status === "cancelled")!;
  assert.equal(cancelled.start, "2026-03-12T09:00:00-04:00");
  assert.equal(cancelled.recurrenceId, "2026-03-12T13:00:00.000Z");
  assert.equal(cancelled.title, "Meeting");
});

test("an occurrence moved beyond the visible window retains its original anchor", () => {
  const raw = feed(`BEGIN:VEVENT
UID:moved-away
SUMMARY:Away
DTSTART:20260310T090000Z
DTEND:20260310T100000Z
RRULE:FREQ=DAILY;COUNT=2
END:VEVENT
BEGIN:VEVENT
UID:moved-away
RECURRENCE-ID:20260310T090000Z
DTSTART:20260410T090000Z
DTEND:20260410T100000Z
END:VEVENT`);
  const events = parseICalendar(raw, "x", range, "UTC");
  assert.equal(events.length, 2);
  assert.equal(events.find(event => event.recurrenceId === "2026-03-10T09:00:00.000Z")?.start,
    "2026-04-10T09:00:00+00:00");
});

test("floating, UTC, exclusive all-day end and cross-day times", () => {
  const raw = feed(`BEGIN:VEVENT
UID:floating
DTSTART:20260310T230000
DTEND:20260311T010000
SUMMARY:Late
END:VEVENT
BEGIN:VEVENT
UID:utc
DTSTART:20260311T010000Z
DTEND:20260311T020000Z
SUMMARY:UTC
END:VEVENT
BEGIN:VEVENT
UID:allday
DTSTART;VALUE=DATE:20260310
DTEND;VALUE=DATE:20260312
SUMMARY:Two days
END:VEVENT`);
  const events = parseICalendar(raw, "x", range, "Asia/Taipei");
  assert.equal(events.length, 3);
  assert.equal(events.find(event => event.uid === "floating")?.start, "2026-03-10T23:00:00+08:00");
  assert.equal(events.find(event => event.uid === "floating")?.end, "2026-03-11T01:00:00+08:00");
  assert.equal(events.find(event => event.uid === "utc")?.start, "2026-03-11T09:00:00+08:00");
  const allDay = events.find(event => event.uid === "allday")!;
  assert.equal(allDay.allDay, true);
  assert.equal(allDay.end, "2026-03-12T00:00:00+08:00");
});

test("VTIMEZONE is applied and tracked occurrence outside view remains available", () => {
  const raw = feed(`BEGIN:VTIMEZONE
TZID:Custom/Fixed
BEGIN:STANDARD
DTSTART:19700101T000000
TZOFFSETFROM:+0800
TZOFFSETTO:+0800
TZNAME:Fixed
END:STANDARD
END:VTIMEZONE
BEGIN:VEVENT
UID:long
DTSTART;TZID=Custom/Fixed:20260307T090000
DTEND;TZID=Custom/Fixed:20260307T100000
RRULE:FREQ=DAILY;COUNT=10
END:VEVENT`);
  const id = sourceEventId("x", "long", "2026-03-15T01:00:00.000Z");
  const events = parseICalendar(raw, "x", range, "Asia/Taipei", new Set([id]));
  assert.ok(events.some(event => event.id === id));
  assert.equal(events[0].start, "2026-03-07T09:00:00+08:00");
});

test("invalid or ambiguous feeds and unknown zones fail explicitly", () => {
  assert.throws(() => parseICalendar("<html>bad</html>", "x", range, "Asia/Taipei"), ICalError);
  assert.throws(() => parseICalendar(feed(`BEGIN:VEVENT
UID:bad
DTSTART;TZID=Nowhere/Unknown:20260310T090000
DTEND;TZID=Nowhere/Unknown:20260310T100000
END:VEVENT`), "x", range, "Asia/Taipei"), (error: unknown) => error instanceof ICalError && error.kind === "zone");
  const duplicate = `BEGIN:VEVENT
UID:duplicate
DTSTART:20260310T090000Z
DTEND:20260310T100000Z
END:VEVENT`;
  assert.throws(() => parseICalendar(feed(duplicate + "\n" + duplicate), "x", range, "Asia/Taipei"), ICalError);
});
