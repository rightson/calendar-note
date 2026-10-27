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

test("timed events without an end keep zero duration and obey half-open range boundaries", () => {
  const raw = feed(`BEGIN:VEVENT
UID:point-start
DTSTAMP:20260301T000000Z
DTSTART:20260307T000000Z
SUMMARY:Point at start
END:VEVENT
BEGIN:VEVENT
UID:point-end
DTSTAMP:20260301T000000Z
DTSTART:20260315T000000Z
SUMMARY:Point at end
END:VEVENT
BEGIN:VEVENT
UID:normal
DTSTAMP:20260301T000000Z
DTSTART:20260310T120000Z
DTEND:20260310T130000Z
SUMMARY:Normal
END:VEVENT`);
  const events = parseICalendar(raw, "x", range, "UTC");
  assert.deepEqual(events.map(event => event.uid), ["point-start", "normal"]);
  assert.equal(events[0].start, events[0].end);
  const tracked = parseICalendar(raw, "x", range, "UTC", new Set([sourceEventId("x", "point-end")]));
  assert.equal(tracked.find(event => event.uid === "point-end")?.start, "2026-03-15T00:00:00+00:00");
});

test("zero-duration recurrence and moved exception keep original anchors; other exceptions inherit master duration", () => {
  const raw = feed(`BEGIN:VEVENT
UID:points
DTSTAMP:20260301T000000Z
DTSTART:20260307T090000Z
RRULE:FREQ=DAILY;COUNT=2
END:VEVENT
BEGIN:VEVENT
UID:points
DTSTAMP:20260301T000000Z
RECURRENCE-ID:20260308T090000Z
DTSTART:20260309T120000Z
END:VEVENT
BEGIN:VEVENT
UID:hourly
DTSTAMP:20260301T000000Z
DTSTART:20260307T140000Z
DTEND:20260307T150000Z
RRULE:FREQ=DAILY;COUNT=2
END:VEVENT
BEGIN:VEVENT
UID:hourly
DTSTAMP:20260301T000000Z
RECURRENCE-ID:20260308T140000Z
DTSTART:20260309T160000Z
END:VEVENT`);
  const events = parseICalendar(raw, "x", range, "UTC");
  const movedPoint = events.find(event => event.uid === "points" && event.recurrenceId === "2026-03-08T09:00:00.000Z");
  assert.equal(movedPoint?.start, "2026-03-09T12:00:00+00:00");
  assert.equal(movedPoint?.end, movedPoint?.start);
  const movedHour = events.find(event => event.uid === "hourly" && event.recurrenceId === "2026-03-08T14:00:00.000Z");
  assert.equal(movedHour?.start, "2026-03-09T16:00:00+00:00");
  assert.equal(movedHour?.end, "2026-03-09T17:00:00+00:00");
});

test("UTF-8 BOM is accepted without changing ordinary LF or CRLF parsing", () => {
  const raw = feed(`BEGIN:VEVENT
UID:bom
DTSTAMP:20260301T000000Z
DTSTART:20260310T120000Z
DTEND:20260310T130000Z
END:VEVENT`);
  assert.equal(parseICalendar(`\uFEFF${raw}`, "x", range, "UTC").length, 1);
  assert.equal(parseICalendar(raw.replace(/\r\n/g, "\n"), "x", range, "UTC").length, 1);
});

test("explicit equal or reversed ends and zero-length all-day spans remain invalid", () => {
  for (const [start, end] of [
    ["DTSTART:20260310T120000Z", "DTEND:20260310T120000Z"],
    ["DTSTART:20260310T120000Z", "DTEND:20260310T110000Z"],
    ["DTSTART;VALUE=DATE:20260310", "DTEND;VALUE=DATE:20260310"],
  ]) {
    const raw = feed(`BEGIN:VEVENT
UID:invalid-span
DTSTAMP:20260301T000000Z
${start}
${end}
END:VEVENT`);
    assert.throws(() => parseICalendar(raw, "x", range, "UTC"), ICalError);
  }
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

test("a complete VCALENDAR stream combines distinct events and keeps each embedded time zone", () => {
  const calendar = (uid: string, offset: string) => feed(`BEGIN:VTIMEZONE
TZID:Custom/Shared
BEGIN:STANDARD
DTSTART:19700101T000000
TZOFFSETFROM:${offset}
TZOFFSETTO:${offset}
END:STANDARD
END:VTIMEZONE
BEGIN:VEVENT
UID:${uid}
DTSTAMP:20260301T000000Z
DTSTART;TZID=Custom/Shared:20260310T090000
DTEND;TZID=Custom/Shared:20260310T100000
END:VEVENT`);
  const events = parseICalendar(calendar("east", "+0800") + calendar("west", "-0500"), "x", range, "UTC");
  assert.deepEqual(events.map(event => [event.uid, event.start]), [
    ["east", "2026-03-10T01:00:00+00:00"],
    ["west", "2026-03-10T14:00:00+00:00"],
  ]);
});

test("stream rejects malformed trailing content and duplicate UID across calendars", () => {
  const one = feed(`BEGIN:VEVENT
UID:shared
DTSTAMP:20260301T000000Z
DTSTART:20260310T090000Z
END:VEVENT`);
  const errorCode = (raw: string) => {
    try { parseICalendar(raw, "x", range, "UTC"); }
    catch (error) { assert.ok(error instanceof ICalError); return error.code; }
    assert.fail("Expected an iCalendar error");
  };
  assert.equal(errorCode(one + "garbage"), "invalid-feed");
  assert.equal(errorCode(one + "BEGIN:VCALENDAR\r\nVERSION:2.0\r\n"), "invalid-feed");
  assert.equal(errorCode(one + one), "duplicate-event-uid");
  assert.equal(parseICalendar(" \t\r\n\r\n\uFEFF" + one + "\t \r\n", "x", range, "UTC").length, 1);
  assert.equal(parseICalendar(one + " \r\n\uFEFF" + feed(`BEGIN:VEVENT
UID:other
DTSTAMP:20260301T000000Z
DTSTART:20260311T090000Z
END:VEVENT`), "x", range, "UTC").length, 2);
});

test("PERIOD RDATE uses its own end, while EXDATE and a moved exception retain precedence", () => {
  const raw = feed(`BEGIN:VEVENT
UID:periods
DTSTAMP:20260301T000000Z
DTSTART:20260310T090000Z
DTEND:20260310T100000Z
RDATE;VALUE=PERIOD:20260311T090000Z/20260311T120000Z,20260312T090000Z/PT2H,20260313T090000Z/PT3H
EXDATE:20260313T090000Z
END:VEVENT
BEGIN:VEVENT
UID:periods
DTSTAMP:20260301T000000Z
RECURRENCE-ID:20260312T090000Z
DTSTART:20260312T140000Z
DTEND:20260312T150000Z
SUMMARY:Moved
END:VEVENT`);
  const events = parseICalendar(raw, "x", range, "UTC");
  assert.deepEqual(events.map(event => [event.recurrenceId, event.start, event.end]), [
    ["2026-03-10T09:00:00.000Z", "2026-03-10T09:00:00+00:00", "2026-03-10T10:00:00+00:00"],
    ["2026-03-11T09:00:00.000Z", "2026-03-11T09:00:00+00:00", "2026-03-11T12:00:00+00:00"],
    ["2026-03-12T09:00:00.000Z", "2026-03-12T14:00:00+00:00", "2026-03-12T15:00:00+00:00"],
  ]);
  assert.equal(events[2].title, "Moved");
});

test("PERIOD RDATE in another known zone keeps its instant and duration", () => {
  const raw = feed(`BEGIN:VEVENT
UID:zone-period
DTSTAMP:20260301T000000Z
DTSTART;TZID=Asia/Taipei:20260310T090000
DTEND;TZID=Asia/Taipei:20260310T100000
RDATE;VALUE=PERIOD;TZID=America/New_York:20260311T090000/20260311T110000
END:VEVENT`);
  const events = parseICalendar(raw, "x", range, "UTC");
  assert.deepEqual(events.map(event => [event.recurrenceId, event.start, event.end]), [
    ["2026-03-10T01:00:00.000Z", "2026-03-10T01:00:00+00:00", "2026-03-10T02:00:00+00:00"],
    ["2026-03-11T13:00:00.000Z", "2026-03-11T13:00:00+00:00", "2026-03-11T15:00:00+00:00"],
  ]);
});

test("RRULE and PERIOD RDATE at one anchor create one occurrence with the period duration", () => {
  const raw = feed(`BEGIN:VEVENT
UID:period-duplicate
DTSTAMP:20260301T000000Z
DTSTART:20260310T090000Z
DTEND:20260310T100000Z
RRULE:FREQ=DAILY;COUNT=3
RDATE;VALUE=PERIOD:20260311T090000Z/20260311T120000Z
EXDATE:20260312T090000Z
END:VEVENT`);
  const events = parseICalendar(raw, "x", range, "UTC");
  assert.deepEqual(events.map(event => [event.recurrenceId, event.end]), [
    ["2026-03-10T09:00:00.000Z", "2026-03-10T10:00:00+00:00"],
    ["2026-03-11T09:00:00.000Z", "2026-03-11T12:00:00+00:00"],
  ]);
});

test("valid delta cancellations are typed as unsupported snapshots; malformed dates have typed errors", () => {
  const cancel = (recurrence = "") => feed(`BEGIN:VEVENT
UID:cancelled
DTSTAMP:20260301T000000Z
ORGANIZER:mailto:organizer@example.com
ATTENDEE:mailto:user@example.com
SEQUENCE:1
${recurrence}STATUS:CANCELLED
END:VEVENT`).replace("PRODID:-//Calendar-Note tests//EN\r\n", "PRODID:-//Calendar-Note tests//EN\r\nMETHOD:CANCEL\r\n");
  for (const raw of [cancel(), cancel("RECURRENCE-ID:20260310T090000Z\n"), cancel("DTSTART:20260310T090000Z\n")]) {
    assert.throws(() => parseICalendar(raw, "x", range, "UTC"),
      (error: unknown) => error instanceof ICalError && error.kind === "parse" && error.code === "unsupported-calendar-update");
  }
  const malformed = feed(`BEGIN:VEVENT
UID:bad-time
DTSTAMP:20260301T000000Z
DTSTART:not-a-date
END:VEVENT`);
  assert.throws(() => parseICalendar(malformed, "x", range, "UTC"),
    (error: unknown) => error instanceof ICalError && error.code === "invalid-syntax");
});

test("an occurrence without its series imports as a standalone event; a lone cancellation is skipped", () => {
  const raw = feed(`BEGIN:VEVENT
UID:invited-once
RECURRENCE-ID;TZID=Asia/Taipei:20260310T090000
SUMMARY:One instance
DTSTART;TZID=Asia/Taipei:20260310T100000
DTEND;TZID=Asia/Taipei:20260310T110000
END:VEVENT
BEGIN:VEVENT
UID:bare-instance
RECURRENCE-ID;VALUE=DATE:20260311
SUMMARY:All day instance
END:VEVENT
BEGIN:VEVENT
UID:cancelled-instance
RECURRENCE-ID:20260312T090000Z
STATUS:CANCELLED
END:VEVENT`);
  const events = parseICalendar(raw, "x", range, "UTC");
  assert.deepEqual(events.map(event => [event.uid, event.title, event.start, event.end, event.allDay]), [
    ["invited-once", "One instance", "2026-03-10T02:00:00+00:00", "2026-03-10T03:00:00+00:00", false],
    ["bare-instance", "All day instance", "2026-03-11T00:00:00+00:00", "2026-03-12T00:00:00+00:00", true],
  ]);
  assert.equal(events[0].id, sourceEventId("x", "invited-once", "2026-03-10T01:00:00.000Z"));
});

test("a stream may place a series and its exception in separate calendars", () => {
  const master = feed(`BEGIN:VEVENT
UID:split
SUMMARY:Daily
DTSTART:20260310T090000Z
DTEND:20260310T100000Z
RRULE:FREQ=DAILY;COUNT=2
END:VEVENT`);
  const exception = feed(`BEGIN:VEVENT
UID:split
RECURRENCE-ID:20260311T090000Z
SUMMARY:Moved
DTSTART:20260311T150000Z
DTEND:20260311T160000Z
END:VEVENT`);
  for (const raw of [master + exception, exception + master]) {
    const events = parseICalendar(raw, "x", range, "UTC");
    assert.deepEqual(events.map(event => [event.title, event.start]), [
      ["Daily", "2026-03-10T09:00:00+00:00"],
      ["Moved", "2026-03-11T15:00:00+00:00"],
    ]);
  }
});
