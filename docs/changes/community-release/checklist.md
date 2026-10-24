# Community release 0.1.0 preflight

## Release identity and compatibility

- `manifest.json` identifies `calendar-note` as **Calendar-Note**, version `0.1.0`, by `rightson`. The ID uses lowercase letters and a hyphen, and the display name uses permitted Basic Latin characters and punctuation. The description is 77 characters, ends with a period, and describes the plugin action.
- `minAppVersion` is `1.14.5`, matching the Obsidian version used for the documented native QA in [development and QA](../../manuals/DEVELOPMENT.md). Older app versions have not been verified; `1.6.0` was an unsupported compatibility claim.
- `isDesktopOnly` is `true` for the initial release because the documented native QA was on desktop; mobile compatibility has not been established.
- `versions.json` maps `0.1.0` to `1.14.5`, matching the manifest. `package.json` is already `0.1.0`.
- The official public `obsidianmd/obsidian-releases` `community-plugins.json` registry contained zero exact matches for ID `calendar-note` or case-insensitive name `Calendar-Note` on 2026-10-24. This checks published entries only; the Community directory submission validates final uniqueness, including any pending reservation.

## Release and submission checks

- Before submission, ensure the default branch has the final `README.md`, `LICENSE`, and `manifest.json`. The directory reads the manifest at default-branch HEAD.
- Publish a GitHub release tagged exactly `0.1.0` with `main.js` and `manifest.json` as individual binary assets, plus `styles.css` because this plugin uses it. The GitHub source archives and the local ZIP are not substitutes for those assets.
- The first submission is made through the [Obsidian Community directory](https://community.obsidian.md/) after signing in and connecting the repository owner's GitHub account. Review feedback is shown there.
- README network-use disclosure, license and third-party attribution, build outputs, and source review are tracked in their respective release workstreams.

## Source and bundle audit

- The official `eslint-plugin-obsidianmd` recommended configuration (`0.4.2`, with ESLint `9.39.5`) reports **0 errors** across `src`. It reports 45 source warnings for optional style, API, and maintainability recommendations; the command also reports two ignored-file notices for `LICENSE` and `manifest.json`, which have no matching ESLint configuration. These warnings do not block the release.
- Narrow lint suppressions preserve intended behavior: path checks must reject ASCII control characters; the public path sanitizer retains string coercion for unknown values; and the original `FileManager.renameFile` method identity must be saved for exact restoration, with its receiver supplied when called.
- Final validation passed: `npm run typecheck`, all 80 `npm test` cases, and all five legacy preview test files. The official Obsidian ESLint check reported 0 errors, 45 source warnings, and two ignored-file notices for `LICENSE` and `manifest.json`. `git diff --check` and an untracked-file whitespace scan found no whitespace errors.
- `NODE_ENV=production npm run package` passed. The ZIP contains exactly `main.js`, `manifest.json`, `styles.css`, `LICENSE`, and `THIRD_PARTY_LICENSES.txt` under `calendar-note/`; the notices include this project's MIT license and all 12 runtime dependency licenses. In the isolated Obsidian test Vault, the installed plugin loaded, the calendar and settings controls rendered, no JavaScript errors or unhandled rejections were captured, no recovery conflict appeared, and the existing Event Note remained byte-for-byte unchanged. Both test subscriptions stayed disabled. A standalone `moment-timezone` dependency remains because date and iCalendar handling use its `moment.tz` API and IANA zone data; using the host Moment instead is optional guidance, not a verified equivalent for this behavior.

## Official references

- [Submit your plugin](https://docs.obsidian.md/Plugins/Releasing/Submit%20your%20plugin)
- [Submission requirements for plugins](https://docs.obsidian.md/community-directory/submission-requirements-for-plugins)
- [Developer policies](https://docs.obsidian.md/community-directory/developer-policies)
- [Manifest schema and naming rules](https://docs.obsidian.md/Reference/Manifest)
- [Version compatibility mapping](https://docs.obsidian.md/Reference/Versions)
