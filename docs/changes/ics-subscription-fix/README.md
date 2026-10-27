# ICS subscription reliability

These fixes are in development and are not part of the published GitHub 0.1.0 release.

## User story

As a Calendar-Note user, I want a valid iCalendar subscription URL to import reliably and retain the times published by its source, so that feeds with common formatting and zero-duration events do not fail or change meaning.

## Confirmed reproductions

- A UTF-8 BOM before `BEGIN:VCALENDAR` caused an otherwise valid feed to be rejected.
- A timed `VEVENT` without `DTEND` or `DURATION` caused the entire feed to be rejected.
- A settings URL blur followed quickly by Enabled changes could save stale settings over a newer URL.

The specific feed URL reported by the user was not provided, so that feed and its provider response have not been independently verified. A downloadable file may still be an HTML sign-in or error response rather than an ICS response. See [subscription troubleshooting](../../manuals/DEVELOPMENT.md#subscription-troubleshooting).

The exact cause of the reported import failure remains unknown. Current parser compatibility gaps include multiple complete `VCALENDAR` streams in one response and `RDATE;VALUE=PERIOD` recurrence values; both are valid iCalendar forms that another client may accept. Delta objects sent with `METHOD:CANCEL` are unsupported, with or without event times. They must produce a specific error rather than be interpreted as a full snapshot, which could remove unrelated imported events. Existing handling of `STATUS:CANCELLED` in complete snapshots is unchanged. These are confirmed product gaps, not confirmed properties of the user's feed.

## Scoped fixes

- Accept a UTF-8 BOM before the calendar header without changing the raw response stored in cache.
- Retain valid zero-duration events and short source intervals in notes and calendar range/display handling. Keep the 15-minute minimum for local creation and manual editing or rescheduling of any event, including imported events.
- Add support for multiple complete `VCALENDAR` streams and `RDATE;VALUE=PERIOD` recurrence values.
- Reject delta objects with `METHOD:CANCEL` using a specific safe error and preserve unrelated imported events; retain existing full-snapshot `STATUS:CANCELLED` handling.
- Report static, privacy-safe error categories for response body, syntax, semantic identity/time/range, limits, timezone, network, HTTP, empty response, `304` cache outcome, and local write failures. Keep fetch, parse, and write failures distinct, and mark last success only after synchronization completes.
- Queue subscription settings updates against the latest settings snapshot to avoid stale URL writes during rapid changes.
- Keep per-source status visible and show a compact main-calendar failure banner without exposing feed URLs or raw response content. Settings status was verified natively; main-calendar banner visibility has source and unit-test coverage but remains unverified in native Obsidian.
- Do not automatically enable a manually disabled feed after an error.

## Acceptance checks

- `npm test` — passed (104 tests).
- `npm run typecheck` — passed.
- Legacy browser-preview suite — passed (all five test files).
- `npm run package`, `node --check main.js`, and ZIP integrity — passed.
- Feed fixtures — passed: public Google feed rendered 33 events; appending a complete calendar stream rendered 34; an all-day event with only `RDATE` retained its `DTSTART`, date anchors, and exclusive end.
- Native Obsidian verification of the new parser compatibility and diagnostics changes: pending.
- Earlier native checks covered settings persistence, BOM/zero-duration rendering, and sanitized Settings status/cache retention on Obsidian 1.14.5/macOS. They did not inspect the main-calendar failure banner and do not verify the current parser compatibility or diagnostics changes.
- `git diff --check`

## Handoff

- Worktree: `/Users/rightson/workspace/github.com/rightson/calendar-note.wt-codex-ics-subscription-fix`
- Branch: `ics-subscription-fix-codex`
- Changed files: `docs/manuals/DEVELOPMENT.md`, `docs/changes/ics-subscription-fix/README.md`, `src/calendar-view.ts`, `src/event-properties-state.ts`, `src/events.ts`, `src/history.ts`, `src/ical-errors.ts`, `src/ical.ts`, `src/main.ts`, `src/notes.ts`, `src/settings-tab.ts`, `src/subscription-settings.ts`, `src/subscriptions.ts`, `src/sync.ts`, `styles.css`, `tests/event-properties.test.ts`, `tests/ical.test.ts`, `tests/subscription-errors.test.ts`, `tests/subscription-settings.test.ts`, `tests/sync.test.ts`, `tests/vault-core.test.ts`.
- Build artifact: `dist/calendar-note.zip`.
- Merge after review: `git -C /Users/rightson/workspace/github.com/rightson/calendar-note merge --ff-only ics-subscription-fix-codex`
- Cleanup after merge: `git -C /Users/rightson/workspace/github.com/rightson/calendar-note worktree remove /Users/rightson/workspace/github.com/rightson/calendar-note.wt-codex-ics-subscription-fix && git -C /Users/rightson/workspace/github.com/rightson/calendar-note branch -d ics-subscription-fix-codex`
