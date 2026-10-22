# Calendar-Note

Calendar-Note is a proposed Obsidian calendar plugin built around Event Notes. Clicking an event opens its note and adds a link under the `Event` section of the Daily Note for that event's date. ISO week numbers support weekly planning, and clicking a calendar date opens its Daily Note. iCal subscriptions are optional: local events can be created and rescheduled without a subscription.

The repository currently contains a product proposal and an interactive HTML prototype. The Obsidian plugin, live iCal fetching, and Vault writes have not been implemented.

## Proposal and previews

Proposal documents and their assets live in `docs/changes/calendar-note/`:

- [Product proposal](docs/changes/calendar-note/proposal.html): user stories, event and journal linking, frontmatter, subscription boundaries, architecture, and acceptance criteria.
- [Calendar preview](docs/changes/calendar-note/preview/index.html): week, month, day, and list views; ISO week numbers; direct date-to-Daily-Note opening; local event creation; Event Note and Daily Note previews.
- [Settings preview](docs/changes/calendar-note/preview/settings.html): optional subscriptions, Event Note and Daily Note path formats, and live path previews.

GitHub displays the HTML source. To use the interactive previews, download the repository and open the HTML files in a browser, or run this static server from the repository root:

```sh
python3 -m http.server 4317 --bind 127.0.0.1
```

Then open:

- Proposal: <http://127.0.0.1:4317/docs/changes/calendar-note/proposal.html>
- Calendar: <http://127.0.0.1:4317/docs/changes/calendar-note/preview/index.html>
- Settings: <http://127.0.0.1:4317/docs/changes/calendar-note/preview/settings.html>

No dependency installation or build is required. Moment is bundled locally; the previews do not depend on an external CDN.

## Try the prototype

1. **Read the week number.** Week, day, and list views show the ISO week-year, such as `2026-W43`. Month and sidebar calendars show a label for each week row. Weeks start on Monday; January 1, 2027 belongs to `2026-W53`, and January 4 begins `2027-W01`.
2. **Open a date's Daily Note.** Click a main week/day date heading, month date number, or list date heading. The preview opens or creates that date's Daily Note, even when it has no events. It keeps the view and selects the clicked date; choose **Day** to inspect its schedule. Sidebar mini-calendar dates remain navigation. Reopening preserves note content and creates no event or event link.
3. **Start without iCal.** Local events work independently. No subscription URL is required. Sample events are dated October 19–25, 2026.
4. **Create an event.** Click an empty time slot in week or day view, or choose **New event**, then enter a title and start/end times. Canceling leaves no event behind.
5. **Create overlapping events.** Right-click an existing event and choose to create an event at that time. You do not need to find an uncovered slot. The creation dialog also accepts an occupied time range.
6. **Open a note.** The first click creates a sample Event Note and adds a bullet link under `## Event` in the Daily Note for the event's start date. Reopening does not duplicate the link.
7. **Check a past date.** Open the October 22 event and switch to its Daily Note. The link belongs to October 22, regardless of when you click.
8. **Adjust the interval.** Drag the top edge to change the start or the bottom edge to change the end. A time-editing dialog provides precise input. The Event Note keeps its identity and path while its frontmatter and journal link are updated.
9. **Inspect Markdown.** The three required event properties are collapsed by default. Preview or download either the Event Note or the Daily Note.
10. **Optionally add subscriptions.** URL fields demonstrate settings only. Sample subscriptions must be loaded explicitly; the prototype does not fetch remote events.

## Paths and file format

The default Event Note path is:

```text
[Calendar Notes]/{title}
```

Date-based folders are supported, for example:

```text
[Meetings]/YYYY/MM/DD/{title}
```

The title `Product strategy / Q4: Roadmap?` becomes `Product strategy Q4 Roadmap.md`. Dates come from the event's start time. Formats support Moment date tokens, locales, `[literal]` text, and escaping. `{title}`, `{calendar}`, and `{uid}` are additional event variables.

Unknown variables, parent traversal, and absolute paths are rejected. Filename collisions receive a numeric suffix instead of overwriting another note. Changing a path format does not move existing notes.

Local Event Notes use three required frontmatter fields:

```yaml
---
event_id: "local|event-42"
start: "2026-10-22T10:00:00+08:00"
end: "2026-10-22T11:00:00+08:00"
---
```

Daily Notes have a separate Moment path format, which defaults to:

```text
[Daily Notes]/YYYY-MM-DD
```

Daily Note patterns accept Moment date tokens and literal text, with event variables reserved for Event Note patterns. Both date clicks and event actions resolve Daily Note paths from midnight on the corresponding date in Asia/Taipei, so different event times do not split one date into different files. Direct date clicks use the selected calendar date with this format. A missing prototype Daily Note starts with a date heading and a Journal section; an existing note is opened without modification. The direct date panel offers read-only Markdown and a download. Only event actions add or update event links. Custom formats that map multiple dates to one path reuse the same file, and collisions with Event Notes are rejected.

The generated journal entry for an event looks like this:

```markdown
## Event
- 10:00–11:00 [[Calendar Notes/Product strategy Q4 Roadmap|Product strategy Q4 Roadmap]]
```

The planned plugin will reuse the core Daily Notes folder, custom format, and template. When that core plugin is disabled, Calendar-Note will use its own settings. The HTML prototype demonstrates these settings independently and does not read a real Obsidian configuration.

## Data and limitations

- Events, settings, and both note types are stored in the current browser's localStorage. Markdown files are exported only when downloaded. Clearing browser storage resets the prototype.
- File URLs and HTTP URLs may use separate storage. If browser storage is unavailable, the current page remains usable, but changes may not survive a reload.
- Use sample URLs. There are no live iCal requests, scheduled polling, Obsidian API calls, or remote writes.
- Rescheduling an imported event creates a local override; it does not write back to the subscription provider.
- The prototype uses Asia/Taipei (UTC+8). Editing is limited to intervals within one calendar day, ending no later than the following midnight, with a minimum duration of 15 minutes. Full cross-day and DST handling remain part of the V1 specification.
- The HTML supports week, month, day, and list views. Year and custom-day views, complete RRULE handling, and actual Vault writes remain planned plugin features.

## Language policy

Repository-authored documentation, comments, messages, test descriptions, and preview UI use English. English is the default date locale. Multilingual dates and Unicode filenames remain supported; bundled third-party locale data is retained unchanged. Existing user-created content in browser storage is not translated automatically.

## Checks

Run from the repository root:

```sh
node --check docs/changes/calendar-note/preview/app.js
node --check docs/changes/calendar-note/preview/path-format.js
node --check docs/changes/calendar-note/preview/event-core.js
node docs/changes/calendar-note/preview/smoke-test.cjs
node docs/changes/calendar-note/preview/event-core.test.cjs
node docs/changes/calendar-note/preview/daily-note.test.cjs
```

Week/date regression checks cover ISO week-year boundaries and direct Daily Note path resolution, preservation, and conflicts. Path tests cover Moment formats, locales, literal text, protected event variables, filename sanitization, Unicode byte limits, and relative paths. Event tests cover event-date journal paths, heading and code-fence boundaries, duplicate links, Markdown preservation, stable identity, overlap layout, and interval resizing.

A temporary DOM simulation was also used to check initialization, creation without subscriptions, past-date links, deduplication, moving journal entries between dates, three-way overlap, resize and cancellation handlers, context-menu times, blank URL drafts, reload persistence, and collision rollback. The DOM test package is not a project runtime dependency.

Browser checks for this revision verified direct date opening in week, month, day, and list views; empty dates and hidden sources; keyboard activation and focus return; shared content between event and direct-date entry points; saved custom path settings; and ISO week-years around New Year. Desktop and narrow layouts were visually inspected, including month/sidebar week gutters. Full browser drag-and-drop acceptance and actual Obsidian integration remain unverified; the core tests do not establish those behaviors.

## Documentation lifecycle

Draft proposals remain in `docs/changes/calendar-note/`. Once the specification is finalized, move the documents and preview assets together to `docs/specs/calendar-note/`, updating this README and relative links. Draft documents do not represent a completed plugin implementation.

Publishing a source branch to GitHub does not deploy a GitHub Pages site or release an Obsidian community plugin.

## References and licenses

- [TaskNotes](https://github.com/callumalpass/tasknotes), reviewed local revision `971e5c9a`: calendar views and event-note concepts.
- [Obsidian Day Planner](https://github.com/ivan-lednev/obsidian-day-planner), reviewed local revision `9c483b36`: source configuration, caching, recurrence, and time zones.
- [Daily Notes documentation](https://obsidian.md/help/plugins/daily-notes).
- [Moment format documentation](https://momentjs.com/docs/#/displaying/format/).

Both reference projects use the MIT license. The prototype does not import their full plugin architectures. The bundled Moment 2.30.1 license is in [MOMENT-LICENSE](docs/changes/calendar-note/preview/vendor/MOMENT-LICENSE). See [LICENSE](LICENSE) for this project's license.
