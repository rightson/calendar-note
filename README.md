# Calendar-Note

Calendar-Note is an Obsidian calendar plugin for local events, Event Notes, Daily Notes, Weekly Notes, and optional read-only iCal subscriptions. It is available as a local plugin build. The separate HTML preview remains a browser-only design prototype and does not read or write an Obsidian Vault.

## Install a local build

Use Node.js 22 or newer. From a clone of this repository, run:

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run package
```

The distributable is `dist/calendar-note.zip`. Extract its `calendar-note` folder into `<VAULT>/.obsidian/plugins/`, so the resulting plugin folder contains `main.js`, `manifest.json`, `styles.css`, `LICENSE`, and `THIRD_PARTY_LICENSES.txt`. In Obsidian, open **Settings → Community plugins**, enable community plugins if needed, enable **Calendar-Note**, then reload the app if prompted. The plugin ID and folder name are `calendar-note`.

For an isolated installation, build first and run `npm run install:test-vault -- /absolute/path/to/test-vault`. The destination must already be a directory whose name includes `test`; the script installs only into that explicit Vault. Do not point it at a personal Vault.

To uninstall, disable Calendar-Note and remove `<VAULT>/.obsidian/plugins/calendar-note`. Its `data.json` stores settings, source/cache/history, and note-link tracking; `recovery.json` stores any interrupted multi-file transaction. Both are inside the plugin folder and will be removed with it. Event, Daily, and Weekly Markdown files remain in the Vault, including their existing links. Copy `data.json` first if you may want to preserve settings, history, or tracking state. Resolve pending recovery before uninstalling; if it cannot be resolved, keep a copy of `recovery.json` until recovery is handled.

## Use the plugin

Open **Calendar-Note** from its ribbon icon or command palette. The **Calendar-Note: Open calendar** command opens the calendar. The toolbar offers Week, Day, Month, Year, Custom days, and List views, a Workdays/All days switch for the main calendar, Today, and New event, Refresh calendars, and History. All days is the default; Workdays shows Monday through Friday in the main calendar while the mini-calendar keeps all seven weekdays and the configured week rules unchanged. Close the expanded sidebar with its × control; when collapsed, a compact icon handle at the left edge restores it without adding a toolbar row. Drag or keyboard-adjust the sidebar separator to resize it; width is saved between launches. The sidebar and main calendar fill the available pane height and stay bottom-aligned. Other commands are **Calendar-Note: New event**, **Calendar-Note: Refresh calendars**, **Calendar-Note: Show change history**, and **Calendar-Note: Retry pending recovery**.

Local events work without subscriptions. Create an event from **New event** or an empty calendar slot; the event-title input has a full-width labeled row, and right-clicking an occupied slot can add overlapping events. Drag either resize edge or move an event to change its time. Local Event Notes are Markdown files with `event_id`, `start`, and `end` frontmatter. The default path pattern is `[Calendar Notes]/{title}`. Event clicks open the linked note and add a managed bullet beneath `## Event` in the Daily Note for its start date. Date controls open that date's Daily Note. The sidebar pairs **Today** with month navigation; its subtly highlighted current-week number remains clickable and opens the Weekly Note. Existing note text and unrelated frontmatter are preserved during managed edits. New fallback Daily Notes and Weekly Notes begin with `## Journal` and `## Weekly review`. A new Event Note omits a title heading only when its basename matches the original event title; custom or sanitized filenames keep a heading. Existing notes and user templates are preserved without automatic heading changes.

The settings tab configures the Event Note path pattern, Daily and Weekly fallback folders/formats/templates, week rules, display time zone, snap interval, event duration, custom-days view, and iCal sources. Calendar chrome uses English abbreviations regardless of note locale; Moment locale and week rules still control date formatting and week identity. Date formats use Moment tokens; Event Note patterns also accept `{title}`, `{calendar}`, and `{uid}`. Daily Notes use the enabled Obsidian Daily Notes settings when available. Weekly settings prefer enabled Periodic Notes weekly settings, then the Calendar community plugin settings, then Calendar-Note fallbacks. Compatible provider settings are detected internally because Obsidian has no public provider API; this may need adjustment if those plugins change their internal setting shape. Template paths are Vault-relative and `{{date}}` / `{{date:FORMAT}}` tokens are expanded. Obsidian property display follows the user's editor preference; the plugin cannot set it per note through a public API.

## iCal and change history

Subscriptions are optional HTTPS or `webcal://` URLs. Calendar-Note fetches feeds through Obsidian's request API and never writes to the upstream calendar. It parses recurrence, exceptions, cancellations, time zones, and all-day events for the visible range. Failed refreshes retain cached events and use retry backoff. Subscription URLs, feed payloads, and authorization headers are private settings/cache data; history records change details without storing URLs or ICS payloads.

Imported event identity is source plus UID, with the original recurrence ID for recurring instances. Rescheduling an imported event creates a local time override. A later source change keeps that effective local time and is recorded in History. **Use latest source times** clears only the time override and applies the accepted feed interval. History supports All and Needs review filters, opening linked notes, acknowledging a row, and retrying eligible failed note updates. A newer source revision supersedes pending retry work. If a write cannot safely update the tracked note or journal bullet, the change needs attention rather than guessing. The plugin keeps a recovery journal for interrupted multi-file edits; calendar edits pause until recovery succeeds.

Removing or disabling the plugin does not automatically delete Vault notes. A cancelled or removed feed event also does not delete its Event Note or Daily Note entry.

## Verification status

The plugin was loaded in an isolated Obsidian 1.14.5 Vault. Native checks covered local Event Note and Daily Note creation, cross-day rescheduling with custom YAML/body preserved, imported-source changes and recovery/retry, local override resolution, Weekly Note editing, and a live HTTPS ICS fetch. Obsidian file-manager renames with automatic link updates both enabled and declined preserved stable event identity and produced exactly one correct Daily Note bullet; a reload preserved review/resolution history and Weekly Note text. UI checks confirmed full-height bottom-aligned calendar/sidebar content, centered single-line English date labels without duplicate headers after mode changes, pointer and keyboard sidebar resizing with saved width, Workdays persistence with a seven-day mini-calendar, and the focused full-width event-title field. The final compact sidebar controls passed: × closes the expanded sidebar, and an icon-only left-edge handle restores it at the saved width without a toolbar control. Narrow-window behavior, native event drag/resize, and some provider and deep-view checks remain under verification. See [development and QA](docs/manuals/DEVELOPMENT.md) for the tested cases and limits.

## HTML prototype

The pages in `docs/changes/calendar-note/preview/` are a separate interactive browser prototype. Serve the repository root with `python3 -m http.server 4318` and open `http://127.0.0.1:4318/docs/changes/calendar-note/preview/index.html`. Its sample subscriptions and simulated source changes use browser storage only; they are not the live plugin.

See [development and QA](docs/manuals/DEVELOPMENT.md) for build steps, controlled feed fixture checks, recovery scenarios, and the boundary between automated tests and native Obsidian verification. The proposal remains a draft under `docs/changes/calendar-note/`.
