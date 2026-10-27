# ICS subscription reliability

These fixes are in the current development build and are not part of the published GitHub 0.1.0 release.

## User story

As a Calendar-Note user, I want a valid iCalendar subscription URL to import reliably and retain the times published by its source, so that feeds with common formatting and zero-duration events do not fail or change meaning.

## Confirmed reproductions

- A UTF-8 BOM before `BEGIN:VCALENDAR` caused an otherwise valid feed to be rejected.
- A timed `VEVENT` without `DTEND` or `DURATION` caused the entire feed to be rejected.
- A settings URL blur followed quickly by Enabled changes could save stale settings over a newer URL.

The specific feed URL reported by the user was not provided, so that feed and its provider response have not been independently verified. A downloadable file may still be an HTML sign-in or error response rather than an ICS response. See [subscription troubleshooting](../../manuals/DEVELOPMENT.md#subscription-troubleshooting).

## Scoped fixes

- Accept a UTF-8 BOM before the calendar header without changing the raw response stored in cache.
- Retain valid zero-duration events and short source intervals in notes and calendar range/display handling. Keep the 15-minute minimum for local creation and manual editing or rescheduling of any event, including imported events.
- Queue subscription settings updates against the latest settings snapshot to avoid stale URL writes during rapid changes.
- Keep per-source status visible and show a compact main-calendar failure banner without exposing feed URLs or raw response content. Settings status was verified natively; main-calendar banner visibility has source and unit-test coverage but remains unverified in native Obsidian.
- Do not automatically enable a manually disabled feed after an error.

## Acceptance checks

- `npm run typecheck` — passed.
- `npm test` — passed (91 tests).
- Legacy browser-preview suite — passed (all five test files).
- Package build and ZIP integrity — passed.
- `git diff --check`
- Native QA passed in Obsidian 1.14.5 on macOS from the final ZIP in a dedicated test Vault: the new view fetched and rendered a public Google Taiwan holiday feed; rapid URL and Enabled changes persisted the latest state; clearing a URL disabled its source, and enabling a blank source left it disabled; a controlled UTF-8 BOM feed rendered a zero-duration event and a normal event, with the former's start equal to its end; and an invalid HTML response set sanitized Settings status while retaining cached raw ICS content and both rendered events. The main-calendar failure banner was not inspected natively and remains covered only by source/unit checks. The reported user's exact feed remains unverified because its URL was not provided; its provider and response headers also remain unknown. The separate point-event note move check was run on an initial installed build, not the final ZIP.

## Handoff

- Worktree: `/Users/rightson/workspace/github.com/rightson/calendar-note.wt-codex-ics-subscription-fix`
- Branch: `ics-subscription-fix-codex`
- Changed files: `docs/manuals/DEVELOPMENT.md`, `docs/changes/ics-subscription-fix/README.md`, `src/calendar-view.ts`, `src/event-properties-state.ts`, `src/events.ts`, `src/ical.ts`, `src/main.ts`, `src/notes.ts`, `src/settings-tab.ts`, `src/subscription-settings.ts`, `src/subscriptions.ts`, `src/sync.ts`, `styles.css`, `tests/event-properties.test.ts`, `tests/ical.test.ts`, `tests/subscription-settings.test.ts`, `tests/sync.test.ts`, `tests/vault-core.test.ts`.
- Build artifact: `dist/calendar-note.zip`.
- Merge after review: `git -C /Users/rightson/workspace/github.com/rightson/calendar-note merge --ff-only ics-subscription-fix-codex`
- Cleanup after merge: `git -C /Users/rightson/workspace/github.com/rightson/calendar-note worktree remove /Users/rightson/workspace/github.com/rightson/calendar-note.wt-codex-ics-subscription-fix && git -C /Users/rightson/workspace/github.com/rightson/calendar-note branch -d ics-subscription-fix-codex`
