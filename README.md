# Calendar-Note

Calendar-Note brings local events and optional read-only iCal calendars into Obsidian. Events link to Markdown Event Notes and the matching Daily Note; a sidebar can also open Weekly Notes. It includes Week, Day, Month, Year, Custom days, and List views.

## Install

Calendar-Note requires **Obsidian 1.14.5 or later** and supports desktop Obsidian. The plugin has not been submitted to the Community Plugins directory, so it is not available through Obsidian's built-in plugin browser yet.

- **Download and install:** [Download the latest ZIP](https://github.com/rightson/calendar-note/releases/latest/download/calendar-note.zip) and follow the [manual installation guide](docs/manuals/INSTALLATION.md).
- **Install with BRAT:** Install BRAT from Community Plugins, then add `rightson/calendar-note` as a beta plugin. See the [BRAT installation guide](docs/manuals/INSTALLATION.md#install-with-brat).
- [View all GitHub releases](https://github.com/rightson/calendar-note/releases).

## Use

Open the calendar from the ribbon icon or the command palette. Create a local event from **New event** or an empty calendar slot. The event is saved as a Markdown Event Note and linked under `## Events` in the Daily Note for its start date. Click a date to open its Daily Note; the sidebar's week number opens that Weekly Note. Right-click the calendar to open a menu: **New event** creates one at that time, and an **Edit** entry appears for each event at that time (or on that day in Month view), so overlapping events can each be reached. To use a different note for an event, open its details from that menu or from **⋯** and choose **Change…** beside Event Note: pick any Markdown note or type a new path. The previous Event Note stays in the Vault as an ordinary note with its text intact.

Subscriptions are optional. Add an HTTPS or `webcal://` feed in settings to display read-only calendar events. Local events work without a subscription. Imported calendar data is cached for use in the calendar, and event changes can be reviewed in History. Removing the plugin or a feed does not delete Vault notes.

## Privacy and compatibility

No account or telemetry is required. Calendar-Note makes read-only HTTPS requests only to fetch calendar feeds whose URLs you configure. Feed URLs, raw ICS responses, settings, history, link tracking, and recovery data are stored in Obsidian's private plugin data; Event, Daily, and Weekly Notes are written to your Vault. The plugin does not access files outside the Vault and its plugin data folder.

Event Note Properties behavior depends on Obsidian's native editor DOM and is feature-detected; if the property panel is unavailable or hidden, Calendar-Note leaves it alone. Daily and Weekly Note provider settings are detected through internal Obsidian/plugin state because there is no public provider API, so provider updates may require compatibility changes.

See [0.1.1 release notes](docs/releases/0.1.1.md) for the verified scope and known QA limits, [installation guide](docs/manuals/INSTALLATION.md) for setup and updates, and [development and QA](docs/manuals/DEVELOPMENT.md) for build instructions and test coverage. Calendar-Note is licensed under [MIT](LICENSE). Third-party dependency license text is embedded in the release `main.js` and included as `THIRD_PARTY_LICENSES.txt` in the package ZIP.
