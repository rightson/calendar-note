import type { App } from 'obsidian';
import type { CalendarEvent, PluginSettings, WeekRules } from './types';
import { eventCalendarDate, formatAt, weekInfo } from './date';
import { resolveDailySettings, resolveWeeklySettings, resolveWeekRules } from './settings';

const reserved = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i;
// eslint-disable-next-line no-control-regex -- Control characters cannot appear in Vault note names.
const invalid = /[<>:"/\\|?*#^[\]\u0000-\u001f\u007f]/g;

export function cleanSegment(value: unknown): string {
  // eslint-disable-next-line @typescript-eslint/no-base-to-string -- Preserve the sanitizer's string coercion for unknown values.
  let text = String(value ?? '').normalize('NFC').replace(invalid, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/g, '');
  if (!text || /^\.+$/.test(text)) text = 'Untitled event';
  if (reserved.test(text)) text = `_${text}`;
  const encoder = new TextEncoder();
  let output = '';
  for (const character of text) {
    if ([...output].length >= 120 || encoder.encode(output + character).length > 180) break;
    output += character;
  }
  return output.replace(/[. ]+$/g, '') || 'Untitled event';
}

export function folderPath(folder: string): string {
  if (typeof folder !== 'string') throw new Error('Enter a note folder.');
  if (!folder.trim()) return '';
  if (/^[/~]/.test(folder) || /^[a-z]:/i.test(folder) || folder.includes('\\')) throw new Error('Use a relative folder within your Vault.');
  const parts = folder.normalize('NFC').split('/');
  if (parts.some(part => !part.trim() || part.trim() === '.' || part.trim() === '..' ||
    // eslint-disable-next-line no-control-regex -- Reject control characters in each Vault folder segment.
    /[<>:"|?*\u0000-\u001f\u007f]/.test(part) || /[. ]$/.test(part) || reserved.test(part) ||
    /\{(?:title|calendar|uid)\}/i.test(part) || new TextEncoder().encode(part).length > 255)) {
    throw new Error('The note folder contains an invalid or reserved segment.');
  }
  return parts.join('/');
}

interface FormatValues { title?: string; calendar?: string; uid?: string }

/** Format a Vault-relative Markdown path while protecting event variables from Moment tokens. */
export function formatNotePath(
  pattern: string, date: string | Date, rules: WeekRules, zone: string,
  values: FormatValues = {}, dateOnly = false,
): string {
  if (typeof pattern !== 'string' || !pattern.trim()) throw new Error('Enter a complete note path pattern.');
  pattern = pattern.trim().replace(/(?:\.md)+$/i, '');
  if (/^[/~]/.test(pattern) || /^[a-z]:/i.test(pattern)) throw new Error('Use a relative note path within your Vault.');
  if (pattern.split('/').some(part => !part.trim() || part.trim() === '.' || part.trim() === '..')) {
    throw new Error('Note paths cannot contain empty or dot segments.');
  }
  const variables: string[] = [];
  let protectedPattern = '';
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];
    if (char === '\\') {
      if (pattern[i + 1] === '{') {
        const close = pattern.indexOf('}', i + 2);
        if (close < 0) throw new Error('Placeholder braces are incomplete.');
        protectedPattern += `[${pattern.slice(i + 1, close + 1)}]`;
        i = close;
      } else protectedPattern += char + (pattern[++i] ?? '');
    } else if (char === '[') {
      const close = pattern.indexOf(']', i + 1);
      if (close < 0) throw new Error('Moment literal brackets are incomplete.');
      protectedPattern += pattern.slice(i, close + 1);
      i = close;
    } else if (char === '{') {
      const close = pattern.indexOf('}', i + 1);
      if (close < 0) throw new Error('Placeholder braces are incomplete.');
      const name = pattern.slice(i + 1, close) as keyof FormatValues;
      if (dateOnly) throw new Error('Date note paths use date tokens only.');
      if (name.toLowerCase() === 'daily') throw new Error(DAILY_PLACEMENT);
      if (!['title', 'calendar', 'uid'].includes(name)) throw new Error(`Unsupported placeholder {${name}}.`);
      protectedPattern += `[⟦CNPLACEHOLDER${variables.length}⟧]`;
      variables.push(cleanSegment(values[name]));
      i = close;
    } else if (char === '}') throw new Error('Placeholder braces are incomplete.');
    else protectedPattern += char;
  }
  const formatted = formatAt(date, protectedPattern, rules, zone)
    .replace(/⟦CNPLACEHOLDER(\d+)⟧/g, (_token, index: string) => variables[Number(index)]);
  const parts = formatted.split('/');
  if (parts.some(part => !part.trim() || part.trim() === '.' || part.trim() === '..')) {
    throw new Error('The note pattern produced an invalid folder.');
  }
  const cleaned = parts.map(cleanSegment);
  cleaned[cleaned.length - 1] = cleaned[cleaned.length - 1].replace(/(?:\.md)+$/i, '') + '.md';
  return cleaned.join('/');
}

const DAILY_PLACEMENT = '{daily} must start the pattern and be followed by / and the rest of the path.';
const DAILY_PREFIX = /^\{daily\}\/(.*)$/is;

/** The folder holding the Daily Note for this date; empty at the Vault root. */
export function dailyNoteFolder(date: string | Date, app: App, settings: PluginSettings): string {
  const path = dailyNotePath(date, app, settings);
  return path.slice(0, Math.max(path.lastIndexOf('/'), 0));
}

/**
 * A leading `{daily}` segment places the Event Note under the folder of its
 * Daily Note, so Daily Note formats with folders such as `YYYY/MM/YYYY-MM-DD`
 * file Event Notes beside that day's note. The folder is inserted after
 * formatting so its text is never read as Moment tokens.
 */
export function eventNotePath(event: CalendarEvent, sourceName: string, app: App, settings: PluginSettings): string {
  let pattern = typeof settings.eventPattern === 'string' ? settings.eventPattern.trim() : settings.eventPattern;
  let folder = '';
  const daily = DAILY_PREFIX.exec(pattern);
  if (daily) {
    pattern = daily[1];
    folder = dailyNoteFolder(eventCalendarDate(event, settings.timeZone), app, settings);
  }
  const path = formatNotePath(pattern, event.start,
    { locale: settings.locale, weekMode: settings.weekMode, weekStart: settings.weekStart },
    settings.timeZone, { title: event.title, calendar: sourceName, uid: event.uid });
  return folder ? `${folder}/${path}` : path;
}

export function dailyNotePath(date: string | Date, app: App, settings: PluginSettings): string {
  const provider = resolveDailySettings(app, settings);
  const dateName = formatNotePath(provider.format, date,
    { locale: settings.locale, weekMode: settings.weekMode, weekStart: settings.weekStart }, settings.timeZone, {}, true);
  const folder = folderPath(provider.folder);
  return folder ? `${folder}/${dateName}` : dateName;
}

export function weeklyNotePath(date: string | Date, app: App, settings: PluginSettings): string {
  const provider = resolveWeeklySettings(app, settings);
  const rules = resolveWeekRules(app, settings);
  const start = weekInfo(date, rules, settings.timeZone).start;
  const name = formatNotePath(provider.format, start, rules, settings.timeZone, {}, true);
  const folder = folderPath(provider.folder);
  return folder ? `${folder}/${name}` : name;
}
