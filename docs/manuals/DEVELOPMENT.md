# Local development and Obsidian loading

## What can run today

This repository contains a product proposal and an interactive browser prototype. It does not yet contain an Obsidian plugin entry point, `manifest.json`, compiled `main.js`, package manifest, or plugin build command. **Calendar-Note cannot currently be enabled as a local Obsidian plugin.** Copying the HTML preview or its `app.js` into a Vault does not create a plugin.

The current work covers calendar interactions, Event Notes, Daily Notes, editable Weekly Notes, and settings in browser storage. There are no Vault writes or live iCal requests. The [draft proposal](../changes/calendar-note/proposal.html) remains under `docs/changes/`.

## Run the design prototype

From the checkout containing the latest design changes:

```sh
python3 -m http.server 4318 --bind 127.0.0.1
```

Open [the calendar](http://127.0.0.1:4318/docs/changes/calendar-note/preview/index.html) and [settings](http://127.0.0.1:4318/docs/changes/calendar-note/preview/settings.html). Stop the server with Control-C. If port 4318 is occupied, use another port in both the command and URLs. No Node package installation or build is needed for the HTML.

Use This week to open the current Weekly Note, or click a week number to open another week. Edit its Markdown, switch away, and reopen it to check autosave. Reload and open the same week to verify persistence. Download Markdown when you want a file outside the browser. Browser storage does not synchronize with Obsidian, and different origins may have separate stored notes.

## Match an existing Calendar Weekly Note

The browser cannot discover installed Obsidian plugins. Enter matching values manually in the prototype settings:

| Calendar setting | Calendar-Note prototype setting |
| --- | --- |
| Weekly note format | Weekly note format; for example `gggg-[W]ww` |
| Weekly note folder | Weekly note folder; literal Vault-relative text, blank for the root |
| Override locale | Date locale, such as English (US), English (UK), or Traditional Chinese |
| Start week on | Start week on in Calendar locale mode |

In Calendar, enable Show week number to reveal its weekly settings. If Periodic Notes weekly notes are enabled, Calendar uses that provider's weekly format, folder, and template instead. The planned Calendar-Note plugin will follow that precedence, with its own fallback when neither provider is available. Provider detection and templates are not implemented in the browser.

Keep Moment token case: `gggg`/`ww` follow locale week rules; `GGGG`/`WW` use ISO weeks. A calendar-year `YYYY` can differ from a week-year near New Year. Calendar's first-day override preserves the locale's first-week rule. The prototype supports locale-default, Sunday, and Monday starts; ISO mode fixes Monday and the January-4 rule. Matching folder and format alone is insufficient if the effective week rules differ.

The weekly format is evaluated at the selected week's start. Format `gggg/[Week] ww` and folder `Journal/Weekly` produce a path such as `Journal/Weekly/2026/Week 43.md`. A folder named `Archive/YYYY` stays literal; use the format field for date-based subfolders. Changing settings does not move existing notes. Weekly, Daily, and Event Note paths must be distinct; a conflict is reported without overwriting another note.

Compatibility was reviewed against [Calendar settings](https://github.com/liamcain/obsidian-calendar-plugin/blob/ef3f2696da11aa1d11a272179caea062d6144640/src/settings.ts), [Calendar weekly opening](https://github.com/liamcain/obsidian-calendar-plugin/blob/ef3f2696da11aa1d11a272179caea062d6144640/src/view.ts), [locale configuration](https://github.com/liamcain/obsidian-calendar-ui/blob/c275987d032377bb141747da0f9db2c5cde2df03/src/localization.ts), and [weekly settings resolution](https://github.com/liamcain/obsidian-daily-notes-interface/blob/6fcb61850cbb39010b7d1d667fdb90f2a6a4626c/src/settings.ts).

## Load a future plugin build locally

These steps apply **after a real Calendar-Note plugin build exists**. Its build command and output directory must be documented when implementation begins; this snapshot has neither.

1. Create a dedicated test Vault. Obtain built `manifest.json`, `main.js`, and, when provided, `styles.css`.
2. Place those files directly in `<test-vault>/.obsidian/plugins/<manifest-id>/`. The directory must match `id` in `manifest.json`.
3. Open the test Vault in Obsidian. Under Settings → Community plugins, turn on community plugins and enable Calendar-Note. Restart Obsidian if the manifest changed.
4. After updating a build, disable and re-enable the plugin, or reload Obsidian.

Example destination, assuming the future manifest ID is `calendar-note`:

```text
Test Vault/
  .obsidian/
    plugins/
      calendar-note/
        manifest.json
        main.js
        styles.css
```

For a completed build, this manual copy example uses placeholder paths:

```sh
task_build=/absolute/path/to/calendar-note-build
task_vault=/absolute/path/to/test-vault
task_plugin_dir="$task_vault/.obsidian/plugins/calendar-note"
mkdir -p "$task_plugin_dir"
cp "$task_build/manifest.json" "$task_build/main.js" "$task_plugin_dir/"
if [ -f "$task_build/styles.css" ]; then
  cp "$task_build/styles.css" "$task_plugin_dir/"
fi
```

If the Vault uses a custom configuration directory, replace `.obsidian` accordingly. For the underlying loading and reload workflow, see [Obsidian's official plugin development guide](https://docs.obsidian.md/Plugins/Getting%20started/Build%20a%20plugin).

## Checks before local integration

Run from the repository root:

```sh
node --check docs/changes/calendar-note/preview/app.js
node --check docs/changes/calendar-note/preview/path-format.js
node --check docs/changes/calendar-note/preview/event-core.js
node --check docs/changes/calendar-note/preview/weekly-core.js
node docs/changes/calendar-note/preview/smoke-test.cjs
node docs/changes/calendar-note/preview/event-core.test.cjs
node docs/changes/calendar-note/preview/daily-note.test.cjs
node docs/changes/calendar-note/preview/weekly-note.test.cjs
```

These checks exercise the prototype, not Obsidian integration. Once a plugin exists, separately verify opening an existing Calendar Weekly Note, missing-note creation with the provider's template, no duplicate file after reopening, cross-year locale/ISO naming, preserved user text, disabled-provider fallback, and write failures in the test Vault.

## Troubleshooting

- **Calendar-Note is missing from Installed plugins:** this snapshot has no plugin build. For a future build, check for `manifest.json` and `main.js` immediately inside the directory matching the manifest ID.
- **An old UI still appears:** confirm the static server is serving the latest worktree, then reload the browser. After replacing real plugin build files, reload the plugin in Obsidian.
- **The wrong Weekly Note opens:** compare folder, format, effective locale, and first weekday with the provider Calendar is using. Check token case near New Year.
- **Edits are missing in Obsidian:** browser edits are stored in the browser only. A Markdown download must be placed in the Vault manually until real integration exists.
- **A note-path conflict appears:** give Weekly, Daily, and Event Notes separate paths; existing content is preserved.
