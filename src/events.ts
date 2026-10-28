import type { App, TFile } from 'obsidian';
import { dateAt, weekInfo } from './date';
import { dailyNotePath, eventNotePath, weeklyNotePath } from './paths';
import { resolveDailySettings, resolveWeeklySettings, resolveWeekRules } from './settings';
import { pathKey, type NoteLink } from './state';
import { CalendarStore, type PlannedWrite } from './store';
import type { CalendarEvent, Interval, PluginSettings } from './types';
import { addEventBullet, eventBullet, hasTrackedBullet, newEventNote, parseEventNote, removeDuplicateEventNoteTitle, removeTrackedBullet, replaceRenamedBullet, validateEventInterval, validateInterval, writeEventFrontmatter } from './notes';

export interface EventWritePlan {
  writes: PlannedWrite[];
  notePath: string;
  dailyPath: string;
  bullet: string;
  link: NoteLink;
}

export interface IntervalWritePlan {
  writes: PlannedWrite[];
  link?: NoteLink;
  event: CalendarEvent;
}

function eventCalendarDate(event: CalendarEvent, zone: string): string {
  // iCalendar all-day dates are calendar dates, not instants to convert into
  // the display zone. Their exclusive end follows the same rule.
  return event.allDay ? event.start.slice(0, 10) : dateAt(event.start, zone).format('YYYY-MM-DD');
}

function sameEffectiveInterval(note: { start: string; end: string; allDay: boolean }, source: CalendarEvent): boolean {
  if (note.allDay !== source.allDay) return false;
  if (note.allDay) return note.start.slice(0, 10) === source.start.slice(0, 10)
    && note.end.slice(0, 10) === source.end.slice(0, 10);
  return Date.parse(note.start) === Date.parse(source.start) && Date.parse(note.end) === Date.parse(source.end);
}

export class EventNoteService {
  public diagnostics: string[] = [];
  private queue: Promise<unknown> = Promise.resolve();
  private lastValid = new Map<string, CalendarEvent>();

  constructor(private readonly app: App, public readonly store: CalendarStore,
    private readonly getSettings: () => PluginSettings = () => store.state.settings) {}

  private serialized<T>(work: () => Promise<T>): Promise<T> {
    const next = this.queue.then(work, work);
    this.queue = next.then(() => undefined, () => undefined);
    return next;
  }

  private async findEventPath(id: string): Promise<string | null> {
    const matches: string[] = [];
    for (const path of await this.store.io.listMarkdown()) {
      const content = await this.store.io.read(path);
      if (content === null || !content.includes('event_id:')) continue;
      try { if (parseEventNote(content, path)?.id === id) matches.push(path); }
      catch { /* malformed notes are reported by scanEvents */ }
    }
    if (matches.length > 1) throw new Error(`Duplicate event_id ${id}; review the Event Notes before writing.`);
    return matches[0] ?? null;
  }

  private async availableEventPath(event: CalendarEvent): Promise<string> {
    const previous = await this.findEventPath(event.id);
    if (previous) return previous;
    const settings = this.getSettings();
    const sourceName = settings.sources.find(source => source.id === event.sourceId)?.name ?? (event.sourceId === 'local' ? 'Local' : event.sourceId);
    const base = eventNotePath(event, sourceName, settings);
    const known = new Set((await this.store.io.listMarkdown()).map(pathKey));
    for (let number = 1; number < 10_000; number++) {
      const candidate = number === 1 ? base : base.replace(/\.md$/i, ` (${number}).md`);
      const claim = this.store.state.pathTypes[pathKey(candidate)];
      if (claim && (claim.type !== 'event' || claim.ownerId !== event.id)) continue;
      if (!known.has(pathKey(candidate))) return candidate;
      const content = await this.store.io.read(candidate);
      if (content) {
        try { if (parseEventNote(content, candidate)?.id === event.id) return candidate; }
        catch { /* occupied by another or invalid note */ }
      }
    }
    throw new Error('Could not find an unused Event Note filename.');
  }

  private async assertPathType(path: string, type: 'event' | 'daily' | 'weekly', ownerId?: string): Promise<void> {
    const claim = this.store.state.pathTypes[pathKey(path)];
    if (claim && (claim.type !== type || (type === 'event' && claim.ownerId !== ownerId))) {
      throw new Error(`The ${type} Note path conflicts with an existing ${claim.type} Note: ${path}`);
    }
    if (type !== 'event') {
      for (const [id, link] of Object.entries(this.store.state.noteLinks)) {
        if (pathKey(link.eventPath) === pathKey(path)) throw new Error(`The ${type} Note path conflicts with Event Note ${id}.`);
      }
      const content = await this.store.io.read(path);
      if (content) {
        try { if (parseEventNote(content, path)) throw new Error(`The ${type} Note path is an Event Note.`); }
        catch (error) { if (String(error).includes('is an Event Note')) throw error; }
      }
    }
  }

  private async templateContent(path: string, fallback: string, date: string): Promise<string> {
    if (!path.trim()) return fallback;
    const source = path.endsWith('.md') ? path : `${path}.md`;
    const template = await this.store.io.read(source);
    if (template === null) throw new Error(`Note template does not exist: ${source}`);
    const zone = this.getSettings().timeZone;
    return template.replace(/\{\{date(?::([^}]+))?\}\}/g, (_match, format: string | undefined) => dateAt(date, zone).format(format || 'YYYY-MM-DD'))
      .replace(/\{\{time(?::([^}]+))?\}\}/g, (_match, format: string | undefined) => dateAt(date, zone).format(format || 'HH:mm'));
  }

  private async initialDaily(date: string): Promise<string> {
    const provider = resolveDailySettings(this.app, this.getSettings());
    return this.templateContent(provider.template, '## Journal\n\n', date);
  }

  private async initialWeekly(date: string): Promise<string> {
    const settings = this.getSettings();
    const provider = resolveWeeklySettings(this.app, settings);
    const week = weekInfo(date, resolveWeekRules(this.app, settings), settings.timeZone);
    return this.templateContent(provider.template, '## Weekly review\n\n', week.start);
  }

  private async openPath(path: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!file || !('extension' in file) || file.extension !== 'md') throw new Error(`Note is unavailable: ${path}`);
    await this.app.workspace.getLeaf(true).openFile(file as TFile);
  }

  async scanEvents(): Promise<CalendarEvent[]> {
    const events = new Map<string, CalendarEvent>();
    const paths = new Map<string, string>();
    const ambiguous = new Set<string>();
    const validIds = new Set<string>();
    const diagnostics: string[] = [];
    const overrides = { ...this.store.state.overrides };
    const markdownPaths = await this.store.io.listMarkdown();
    for (const remembered of this.lastValid.keys()) if (!markdownPaths.includes(remembered)) this.lastValid.delete(remembered);
    for (const path of markdownPaths) {
      const content = await this.store.io.read(path);
      if (content === null) continue;
      if (!content.includes('event_id:')) {
        const remembered = this.lastValid.get(path);
        if (remembered) { events.set(remembered.id, remembered); diagnostics.push(`${path}: Event Note is missing event_id; last valid event remains visible.`); }
        continue;
      }
      try {
        const note = parseEventNote(content, path);
        if (!note) continue;
        if (!note.id.trim() || paths.has(note.id)) {
          diagnostics.push(`Duplicate or missing event_id in ${path}; the note was skipped.`);
          if (note.id) { ambiguous.add(note.id); events.delete(note.id); validIds.delete(note.id); }
          continue;
        }
        paths.set(note.id, path);
        if (ambiguous.has(note.id)) continue;
        if (note.id.startsWith('local|')) {
          const uid = note.id.slice(6);
          if (!uid || note.source || note.uid) { diagnostics.push(`Invalid local event_id in ${path}.`); continue; }
          events.set(note.id, { id: note.id, sourceId: 'local', uid, title: note.title,
            start: note.start, end: note.end, allDay: note.allDay });
        } else {
          if (!note.source || !note.uid) { diagnostics.push(`Imported Event Note lacks source identity in ${path}.`); continue; }
          const accepted = this.store.state.sourceCaches[note.source]?.accepted[note.id]?.event;
          if (!accepted || accepted.uid !== note.uid || accepted.recurrenceId !== note.recurrenceId) {
            diagnostics.push(`Imported Event Note identity needs review in ${path}.`); continue;
          }
          const difference = !sameEffectiveInterval(note, accepted);
          // A changed note interval is a user override, so it keeps the editing minimum.
          if (difference) validateInterval(note.start, note.end, note.allDay);
          if (difference) overrides[note.id] = { start: note.start, end: note.end, allDay: note.allDay };
          else delete overrides[note.id];
          events.set(note.id, { ...accepted, title: note.title, start: note.start, end: note.end, allDay: note.allDay });
        }
        const valid = events.get(note.id);
        if (valid) { this.lastValid.set(path, valid); validIds.add(note.id); }
      } catch (error) {
        diagnostics.push(`${path}: ${error instanceof Error ? error.message : 'Invalid Event Note.'}`);
        const remembered = this.lastValid.get(path);
        if (remembered && !ambiguous.has(remembered.id)) events.set(remembered.id, remembered);
      }
    }
    for (const id of ambiguous) events.delete(id);
    this.diagnostics = diagnostics;
    for (const [id, currentPath] of paths) {
      const linked = this.store.state.noteLinks[id];
      if (linked && linked.eventPath !== currentPath && validIds.has(id)) {
        try { await this.handleRename({ path: currentPath, extension: 'md' } as TFile, linked.eventPath); }
        catch (error) { diagnostics.push(`${currentPath}: ${error instanceof Error ? error.message : 'Could not relink renamed Event Note.'}`); }
      }
    }
    if (JSON.stringify(overrides) !== JSON.stringify(this.store.state.overrides)) {
      await this.store.commit([], state => { state.overrides = overrides; });
    }
    for (const event of events.values()) {
      const link = this.store.state.noteLinks[event.id];
      if (!link || link.pendingRename || !validIds.has(event.id)) continue;
      const desiredDaily = dailyNotePath(eventCalendarDate(event, this.getSettings().timeZone), this.app, this.getSettings());
      const desiredBullet = eventBullet(event, link.eventPath, this.getSettings().timeZone);
      if (pathKey(desiredDaily) !== pathKey(link.dailyPath) || desiredBullet !== link.bullet) {
        try {
          const plan = await this.planEventWrites(event);
          await this.store.commit(plan.writes, state => { state.noteLinks[event.id] = plan.link; });
        } catch (error) {
          diagnostics.push(`${link.dailyPath}: ${error instanceof Error ? error.message : 'Could not update linked Daily Note.'}`);
        }
      }
    }
    for (const cache of Object.values(this.store.state.sourceCaches)) {
      for (const { event } of Object.values(cache.accepted)) {
        if (!events.has(event.id) && !ambiguous.has(event.id)) {
          const override = this.store.state.overrides[event.id];
          events.set(event.id, override ? { ...event, ...override } : event);
        }
      }
    }
    return [...events.values()];
  }

  async indexLocal(): Promise<CalendarEvent[]> { return (await this.scanEvents()).filter(event => event.sourceId === 'local'); }

  async removeDuplicateTitle(path: string): Promise<boolean> {
    return this.serialized(async () => {
      if (!/\.md$/i.test(path)) return false;
      const before = await this.store.io.read(path);
      if (before === null) return false;
      let note: ReturnType<typeof parseEventNote>;
      try { note = parseEventNote(before, path); }
      catch { return false; }
      if (!note) return false;
      const after = removeDuplicateEventNoteTitle(before, path);
      if (after === before) return false;
      if (await this.findEventPath(note.id) !== path) return false;
      await this.store.commit([{ path, before, after, type: 'event', ownerId: note.id }], () => undefined);
      return true;
    });
  }

  async createLocal(input: { title: string; start: string; end: string; allDay?: boolean }): Promise<CalendarEvent> {
    return this.serialized(async () => {
      validateInterval(input.start, input.end, input.allDay);
      const title = input.title.trim();
      if (!title) throw new Error('Enter an event title.');
      const uid = crypto.randomUUID();
      const event: CalendarEvent = { id: `local|${uid}`, sourceId: 'local', uid, title,
        start: input.start, end: input.end, allDay: input.allDay ?? false };
      const path = await this.availableEventPath(event);
      await this.store.commit([{ path, before: null, after: newEventNote(event, path), type: 'event', ownerId: event.id }], () => undefined);
      try {
        const plan = await this.planEventWrites(event);
        await this.store.commit(plan.writes, state => { state.noteLinks[event.id] = plan.link; });
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'Unknown Daily Note error.';
        throw new Error(`Event Note was created at ${path}, but its Daily Note link could not be added: ${reason}`);
      }
      return event;
    });
  }

  async planEventWrites(event: CalendarEvent): Promise<EventWritePlan> {
    validateEventInterval(event);
    const settings = this.getSettings();
    const notePath = await this.availableEventPath(event);
    await this.assertPathType(notePath, 'event', event.id);
    const noteBefore = await this.store.io.read(notePath);
    if (noteBefore) {
      const parsed = parseEventNote(noteBefore, notePath);
      if (!parsed || parsed.id !== event.id) throw new Error('Event Note identity changed; relink it before writing.');
      if (event.sourceId === 'local') {
        if (parsed.source || parsed.uid || parsed.recurrenceId) throw new Error('Event Note source identity conflicts with this local event.');
      } else if (parsed.source !== event.sourceId || parsed.uid !== event.uid || parsed.recurrenceId !== event.recurrenceId) {
        throw new Error('Event Note source identity changed; review the link before writing.');
      }
    }
    const noteAfter = noteBefore === null ? newEventNote(event, notePath) : writeEventFrontmatter(noteBefore, event);
    const date = eventCalendarDate(event, settings.timeZone);
    const dailyPath = dailyNotePath(date, this.app, settings);
    await this.assertPathType(dailyPath, 'daily');
    if (pathKey(notePath) === pathKey(dailyPath)) throw new Error('Event and Daily Note paths conflict.');
    const dailyBefore = await this.store.io.read(dailyPath);
    const dailyBase = dailyBefore ?? await this.initialDaily(date);
    const bullet = eventBullet(event, notePath, settings.timeZone);
    let previous: NoteLink | undefined = this.store.state.noteLinks[event.id];
    let previousContent: string | null = null;
    if (previous) {
      if (previous.pendingRename) throw new Error('Event Note rename is still settling; retry after its links update.');
      // The link is stale when no note at its path carries this event_id,
      // e.g. it was deleted or Obsidian recreated an empty note from a link.
      const linkedContent = previous.eventPath === notePath ? noteBefore : await this.store.io.read(previous.eventPath);
      let eventDeleted = linkedContent === null;
      if (!eventDeleted) {
        try { eventDeleted = parseEventNote(linkedContent!, previous.eventPath)?.id !== event.id; }
        catch { throw new Error(`Linked Event Note is invalid; fix it before opening: ${previous.eventPath}`); }
      }
      if (!eventDeleted && previous.eventPath !== notePath) throw new Error('Event Note was moved; reindex before opening.');
      previousContent = pathKey(previous.dailyPath) === pathKey(dailyPath) ? dailyBefore : await this.store.io.read(previous.dailyPath);
      // Deleting the Event Note or the tracked Daily Note discards the link,
      // so the next open recreates the notes instead of demanding a relink.
      if (previousContent === null || (eventDeleted && !hasTrackedBullet(previousContent, previous.bullet))) previous = undefined;
    }
    let dailyAfter = dailyBase;
    const writes: PlannedWrite[] = [];
    if (previous && previousContent !== null) {
      if (pathKey(previous.dailyPath) === pathKey(dailyPath)) {
        if (previous.bullet === bullet) {
          if (!hasTrackedBullet(dailyBase, bullet)) throw new Error('Tracked Daily Note entry was edited or moved; relink it before updating this event.');
        } else dailyAfter = removeTrackedBullet(dailyBase, previous.bullet);
      } else {
        writes.push({ path: previous.dailyPath, before: previousContent,
          after: removeTrackedBullet(previousContent, previous.bullet), type: 'daily' });
      }
    }
    if (!(previous && pathKey(previous.dailyPath) === pathKey(dailyPath) && previous.bullet === bullet)) dailyAfter = addEventBullet(dailyAfter, bullet);
    if (noteAfter !== noteBefore) writes.push({ path: notePath, before: noteBefore, after: noteAfter, type: 'event', ownerId: event.id });
    if (dailyAfter !== dailyBefore) writes.push({ path: dailyPath, before: dailyBefore, after: dailyAfter, type: 'daily' });
    const link = { eventPath: notePath, dailyPath, bullet };
    return { writes, notePath, dailyPath, bullet, link };
  }

  async openEvent(event: CalendarEvent): Promise<string> {
    return this.serialized(async () => {
      const path = await this.availableEventPath(event);
      if (event.sourceId === 'local' && await this.store.io.read(path) === null) {
        await this.store.commit([{ path, before: null, after: newEventNote(event, path), type: 'event', ownerId: event.id }], () => undefined);
      }
      const plan = await this.planEventWrites(event);
      await this.store.commit(plan.writes, state => { state.noteLinks[event.id] = plan.link; });
      await this.openPath(plan.notePath);
      return plan.notePath;
    });
  }

  async openDaily(date: string): Promise<string> {
    return this.serialized(async () => {
      const settings = this.getSettings();
      const day = dateAt(date, settings.timeZone).format('YYYY-MM-DD');
      const path = dailyNotePath(day, this.app, settings);
      await this.assertPathType(path, 'daily');
      const existing = await this.store.io.read(path);
      const writes: PlannedWrite[] = existing === null ? [{ path, before: null, after: await this.initialDaily(day), type: 'daily' }] : [];
      await this.store.commit(writes, state => { state.pathTypes[pathKey(path)] = { type: 'daily' }; });
      await this.openPath(path);
      return path;
    });
  }

  async openWeekly(date: string): Promise<string> {
    return this.serialized(async () => {
      const settings = this.getSettings();
      const path = weeklyNotePath(date, this.app, settings);
      await this.assertPathType(path, 'weekly');
      const existing = await this.store.io.read(path);
      const writes: PlannedWrite[] = existing === null ? [{ path, before: null, after: await this.initialWeekly(date), type: 'weekly' }] : [];
      await this.store.commit(writes, state => { state.pathTypes[pathKey(path)] = { type: 'weekly' }; });
      await this.openPath(path);
      return path;
    });
  }

  async updateLinkedInterval(event: CalendarEvent, interval: Interval): Promise<IntervalWritePlan> {
    const updated = { ...event, ...interval, allDay: interval.allDay ?? event.allDay };
    validateEventInterval(updated);
    const link = this.store.state.noteLinks[event.id];
    // A deleted Event Note stays deleted until the user opens the event again.
    if (!link || (!link.pendingRename && await this.store.io.read(link.eventPath) === null)) return { writes: [], event: updated };
    const plan = await this.planEventWrites(updated);
    return { writes: plan.writes, link: plan.link, event: updated };
  }

  async reschedule(event: CalendarEvent, interval: Interval): Promise<CalendarEvent> {
    return this.serialized(async () => {
      const updated = { ...event, ...interval, allDay: interval.allDay ?? event.allDay };
      validateInterval(updated.start, updated.end, updated.allDay);
      const plan = await this.planEventWrites(updated);
      await this.store.commit(plan.writes, state => {
        state.noteLinks[event.id] = plan.link;
        if (event.sourceId !== 'local') state.overrides[event.id] = { start: updated.start, end: updated.end, allDay: updated.allDay };
      });
      return updated;
    });
  }

  async handleRename(file: TFile, oldPath: string): Promise<void> {
    return this.serialized(async () => {
      if (file.extension !== 'md') return;
      const remembered = this.lastValid.get(oldPath);
      if (remembered) {
        this.lastValid.delete(oldPath);
        this.lastValid.set(file.path, remembered);
      }
      const content = await this.store.io.read(file.path);
      if (content === null) return;
      const note = parseEventNote(content, file.path);
      if (note && this.store.state.noteLinks[note.id]?.eventPath === oldPath) {
        await this.assertPathType(file.path, 'event', note.id);
        // fileManager.renameFile rewrites wikilinks after the Vault rename
        // event. Writing the Daily file here races that rewrite's offsets.
        await this.store.commit([], state => {
          const link = state.noteLinks[note.id];
          link.eventPath = file.path;
          link.pendingRename = { oldPath, newPath: file.path };
          state.pathTypes[pathKey(file.path)] = { type: 'event', ownerId: note.id };
          delete state.pathTypes[pathKey(oldPath)];
        });
      } else {
        const entries = Object.entries(this.store.state.noteLinks).filter(([, link]) => link.dailyPath === oldPath);
        if (entries.length) await this.store.commit([], state => {
          for (const [id] of entries) state.noteLinks[id].dailyPath = file.path;
          state.pathTypes[pathKey(file.path)] = { type: 'daily' };
          delete state.pathTypes[pathKey(oldPath)];
        });
      }
    });
  }

  /** Called only after fileManager.renameFile resolves, or during startup recovery. */
  async finalizePendingRenames(newPath?: string): Promise<void> {
    return this.serialized(async () => {
      for (const [id, link] of Object.entries(this.store.state.noteLinks)) {
        const pending = link.pendingRename;
        if (!pending || (newPath && pathKey(pending.newPath) !== pathKey(newPath))) continue;
        const noteContent = await this.store.io.read(pending.newPath);
        const dailyBefore = await this.store.io.read(link.dailyPath);
        if (noteContent === null || dailyBefore === null) throw new Error('Renamed Event Note or tracked Daily Note is missing; relink this event.');
        const note = parseEventNote(noteContent, pending.newPath);
        if (!note || note.id !== id) throw new Error('Renamed Event Note identity changed; relink it before updating its Daily Note.');
        const event: CalendarEvent = { id, sourceId: note.source ?? 'local', uid: note.uid ?? id.slice(6),
          title: note.title, start: note.start, end: note.end, allDay: note.allDay };
        const bullet = eventBullet(event, pending.newPath, this.getSettings().timeZone);
        const dailyAfter = replaceRenamedBullet(dailyBefore, link.bullet, bullet, pending.newPath);
        const writes: PlannedWrite[] = dailyAfter === dailyBefore ? [] : [{ path: link.dailyPath, before: dailyBefore, after: dailyAfter, type: 'daily' }];
        await this.store.commit(writes, state => {
          const settled = state.noteLinks[id];
          settled.bullet = bullet;
          delete settled.pendingRename;
        });
      }
    });
  }
}
