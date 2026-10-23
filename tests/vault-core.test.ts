import assert from 'node:assert/strict';
import test from 'node:test';
import { EventNoteService } from '../src/events';
import { CalendarStore, type RecoveryJournal, type StoreIO } from '../src/store';
import { freshState } from '../src/state';
import { DEFAULT_SETTINGS } from '../src/settings';
import type { App } from 'obsidian';
import { addEventBullet, newEventNote, parseEventNote, validateInterval, writeEventFrontmatter } from '../src/notes';
import { emptySourceCache } from '../src/history';
import { sourceEventId } from '../src/ical';
import type { CalendarEvent } from '../src/types';
import { SourceSyncService } from '../src/sync';

class FakeVault implements StoreIO {
  files = new Map<string, string>();
  data: ReturnType<typeof freshState> | null = null;
  journal: RecoveryJournal | null = null;
  failAt: 'write' | 'write-after' | 'save' | 'save-after' | 'clear' | null = null;
  writeNumber = 0;
  async read(path: string) { return this.files.get(path) ?? null; }
  async listMarkdown() { return [...this.files.keys()].filter(path => path.endsWith('.md')); }
  async write(path: string, before: string | null, after: string | null) {
    assert.equal(await this.read(path), before);
    this.writeNumber++;
    if (this.failAt === 'write' && this.writeNumber === 2) throw new Error('write failed');
    if (after === null) this.files.delete(path); else this.files.set(path, after);
    if (this.failAt === 'write-after' && this.writeNumber === 2) throw new Error('write failed after mutation');
  }
  async loadData() { return this.data ? structuredClone(this.data) : null; }
  async saveData(state: ReturnType<typeof freshState>) {
    if (this.failAt === 'save') throw new Error('save failed');
    this.data = structuredClone(state);
    if (this.failAt === 'save-after') throw new Error('save failed after persistence');
  }
  async loadJournal() { return this.journal ? structuredClone(this.journal) : null; }
  async saveJournal(journal: RecoveryJournal) { this.journal = structuredClone(journal); }
  async clearJournal() { if (this.failAt === 'clear') throw new Error('clear failed'); this.journal = null; }
}

function setup(io = new FakeVault()) {
  const settings = { ...DEFAULT_SETTINGS };
  const store = new CalendarStore(io, freshState(settings));
  const opened: string[] = [];
  const app = {
    vault: { getAbstractFileByPath: (path: string) => io.files.has(path) ? { path, extension: 'md' } : null },
    workspace: { getLeaf: () => ({ openFile: async (file: { path: string }) => { opened.push(file.path); } }) },
  } as unknown as App;
  return { io, store, service: new EventNoteService(app, store), opened };
}

const start = '2026-10-22T10:00:00+08:00';
const end = '2026-10-22T11:00:00+08:00';
const imported = (): CalendarEvent => ({ id: sourceEventId('work', 'uid-1'), sourceId: 'work', uid: 'uid-1',
  title: 'Imported', start, end, allDay: false, status: 'active' });

test('local event creation immediately links its past Daily Note; later clicks deduplicate', async () => {
  const { io, service, store, opened } = setup();
  const event = await service.createLocal({ title: 'Roadmap', start, end });
  assert.equal((await service.indexLocal()).length, 1);
  assert.equal(io.files.size, 2);
  const link = store.state.noteLinks[event.id];
  assert.match(link.dailyPath, /2026-10-22/);
  assert.equal(io.files.get(link.dailyPath)!.startsWith('## Journal\n'), true);
  assert.doesNotMatch(io.files.get(link.dailyPath)!, /^# 2026-10-22/m);
  assert.doesNotMatch(io.files.get(link.eventPath)!, /^# Roadmap/m);
  assert.equal(io.files.get(link.dailyPath)!.split('[[Calendar Notes/Roadmap').length - 1, 1);
  await Promise.all([service.openEvent(event), service.openEvent(event)]);
  assert.equal(io.files.size, 2);
  assert.equal(io.files.get(link.dailyPath)!.split('[[Calendar Notes/Roadmap').length - 1, 1);
  assert.equal(opened.length, 2);
});

test('Daily link failure retains the created Event Note with a clear partial error', async () => {
  const { io, service, store } = setup();
  io.failAt = 'write';
  await assert.rejects(service.createLocal({ title: 'Partial', start, end }), /Event Note was created.*Daily Note link could not be added/);
  assert.equal(io.files.size, 1);
  assert.match([...io.files.values()][0], /event_id: "local\|/);
  assert.equal(Object.keys(store.state.noteLinks).length, 0);
  io.failAt = null;
  const event = (await service.scanEvents())[0];
  assert.equal(event.title, 'Partial');
  await service.openEvent(event);
  assert.equal(io.files.size, 2);
  assert.ok(store.state.noteLinks[event.id]);
});

test('first opening an imported event preflights a path collision without creating an orphan note', async () => {
  const { io, service, store } = setup();
  store.state.settings.eventPattern = '[Daily Notes]/YYYY-MM-DD';
  const event = imported();
  await assert.rejects(service.openEvent(event), /Event and Daily Note paths conflict/);
  assert.equal(io.files.size, 0);
  assert.equal(Object.keys(store.state.noteLinks).length, 0);
  assert.equal(Object.keys(store.state.pathTypes).length, 0);
});

test('rescheduling an unlinked imported cache event creates its note and Daily link with a local override', async () => {
  const { io, service, store } = setup();
  const event = imported();
  const cache = emptySourceCache();
  cache.accepted[event.id] = { event, revision: 0 };
  store.state.sourceCaches.work = cache;
  const updated = await service.reschedule(event, { start: '2026-10-23T14:00:00+08:00', end: '2026-10-23T15:00:00+08:00' });
  const link = store.state.noteLinks[event.id];
  assert.equal(updated.id, event.id);
  assert.equal(io.files.size, 2);
  assert.match(io.files.get(link.eventPath)!, /source: "work"[\s\S]*ical_uid: "uid-1"/);
  assert.match(io.files.get(link.dailyPath)!, /14:00–15:00/);
  assert.match(link.dailyPath, /2026-10-23/);
  assert.equal(store.state.overrides[event.id].start, updated.start);
  assert.equal(store.state.sourceCaches.work.accepted[event.id].event.start, start);
});

for (const allDay of [false, true]) {
  test(`${allDay ? 'all-day date' : 'timed instant'} offset changes do not invent an imported override`, async () => {
    const { io, service, store } = setup();
    const source = { id: 'work', name: 'Work', url: 'https://example.test/feed', color: '#888', enabled: true };
    store.state.settings.sources.push(source);
    const original: CalendarEvent = { ...imported(), allDay,
      start: allDay ? '2026-10-23T00:00:00+08:00' : start,
      end: allDay ? '2026-10-24T00:00:00+08:00' : end };
    const cache = emptySourceCache();
    cache.accepted[original.id] = { event: original, revision: 0 };
    store.state.sourceCaches.work = cache;
    await service.openEvent(original);
    store.state.settings.timeZone = 'America/New_York';
    const equivalent = { ...original,
      start: allDay ? '2026-10-23T00:00:00-04:00' : '2026-10-22T22:00:00-04:00',
      end: allDay ? '2026-10-24T00:00:00-04:00' : '2026-10-22T23:00:00-04:00' };
    const sync = new SourceSyncService(store, service);
    const range = { start: '2026-10-20T00:00:00Z', end: '2026-10-30T00:00:00Z' };
    await sync.accept(source, [equivalent], range);
    await service.scanEvents();
    assert.equal(store.state.overrides[original.id], undefined);
    const changed = { ...equivalent,
      start: allDay ? '2026-10-24T00:00:00-04:00' : '2026-10-23T22:00:00-04:00',
      end: allDay ? '2026-10-25T00:00:00-04:00' : '2026-10-23T23:00:00-04:00' };
    await sync.accept(source, [changed], range);
    assert.equal(store.state.history.at(-1)?.status, 'applied');
    assert.equal(store.state.noteLinks[original.id].dailyPath.endsWith(allDay ? '2026-10-24.md' : '2026-10-23.md'), true);
    assert.match(io.files.get(store.state.noteLinks[original.id].eventPath)!, new RegExp(changed.start));
  });
}

test('all-day events keep their written calendar date after a display-zone change and reschedule', async () => {
  const { io, service, store } = setup();
  const event = await service.createLocal({ title: 'All day', start: '2026-10-23T00:00:00+08:00',
    end: '2026-10-24T00:00:00+08:00', allDay: true });
  const original = store.state.noteLinks[event.id];
  assert.match(original.dailyPath, /2026-10-23\.md$/);
  store.state.settings.timeZone = 'America/New_York';
  await service.openEvent(event);
  assert.equal(store.state.noteLinks[event.id].dailyPath, original.dailyPath);
  assert.equal(io.files.get(original.dailyPath)!.split('[[Calendar Notes/All day').length - 1, 1);
  const moved = await service.reschedule(event, { start: '2026-10-24T00:00:00+08:00',
    end: '2026-10-25T00:00:00+08:00', allDay: true });
  assert.match(store.state.noteLinks[event.id].dailyPath, /2026-10-24\.md$/);
  await service.openEvent(moved);
  assert.match(store.state.noteLinks[event.id].dailyPath, /2026-10-24\.md$/);
  assert.doesNotMatch(io.files.get(original.dailyPath)!, /\[\[Calendar Notes\/All day/);
});

test('timestamp validation rejects normalized impossible dates and short intervals but permits cross-day', () => {
  assert.throws(() => validateInterval('2026-02-30T10:00:00+08:00', '2026-02-30T11:00:00+08:00'), /15 minutes/);
  assert.throws(() => validateInterval('2026-10-23T10:00:00+08:00', '2026-10-23T10:14:00+08:00'), /15 minutes/);
  assert.doesNotThrow(() => validateInterval('2026-10-23T23:00:00+08:00', '2026-10-24T02:00:00+08:00'));
});

test('local note properties remain compact and an edited body survives a cross-date move', async () => {
  const { io, service, store } = setup();
  const event = await service.createLocal({ title: 'Review', start, end });
  await service.openEvent(event);
  const old = store.state.noteLinks[event.id];
  io.files.set(old.eventPath, io.files.get(old.eventPath)!.replace('\n---\n', '\ncustom: true\n---\n') + '\nMy notes.\n');
  io.files.set(old.dailyPath, io.files.get(old.dailyPath)!.replace('## Journal', '## Journal\n\nHandwritten entry'));
  await service.reschedule(event, { start: '2026-10-23T12:00:00+08:00', end: '2026-10-23T13:00:00+08:00' });
  const link = store.state.noteLinks[event.id];
  assert.equal(link.eventPath, old.eventPath);
  assert.notEqual(link.dailyPath, old.dailyPath);
  assert.match(io.files.get(link.eventPath)!, /custom: true[\s\S]*My notes/);
  assert.match(io.files.get(old.dailyPath)!, /Handwritten entry/);
  assert.doesNotMatch(io.files.get(old.dailyPath)!, /\[\[Calendar Notes\/Review/);
  assert.match(io.files.get(link.dailyPath)!, /\[\[Calendar Notes\/Review/);
});

test('edited tracked bullet blocks a move without changing the accepted note interval', async () => {
  const { io, service, store } = setup();
  const event = await service.createLocal({ title: 'One', start, end });
  await service.openEvent(event);
  const link = store.state.noteLinks[event.id];
  io.files.set(link.dailyPath, io.files.get(link.dailyPath)!.replace(link.bullet, '- My edited entry'));
  await assert.rejects(service.reschedule(event, { start: '2026-10-23T10:00:00+08:00', end: '2026-10-23T11:00:00+08:00' }), /relink/);
  assert.match(io.files.get(link.eventPath)!, /2026-10-22T10:00:00/);
  assert.equal(store.state.noteLinks[event.id].dailyPath, link.dailyPath);
});

test('different titles that normalize to the same path receive distinct files', async () => {
  const { service, store } = setup();
  const one = await service.createLocal({ title: 'A/B', start, end });
  const two = await service.createLocal({ title: 'A:B', start, end });
  await service.openEvent(one);
  await service.openEvent(two);
  assert.notEqual(store.state.noteLinks[one.id].eventPath, store.state.noteLinks[two.id].eventPath);
  assert.match(store.state.noteLinks[two.id].eventPath, /\(2\)\.md$/);
});

test('failure on second file write restores both files and state', async () => {
  const { io, store } = setup();
  io.failAt = 'write-after';
  await assert.rejects(store.commit([
    { path: 'A.md', before: null, after: 'A', type: 'daily' },
    { path: 'B.md', before: null, after: 'B', type: 'weekly' },
  ], state => { state.pathTypes.test = { type: 'daily' }; }), /write failed/);
  assert.equal(io.files.size, 0);
  assert.equal(io.journal, null);
  assert.equal(store.state.pathTypes.test, undefined);
});

test('state save ambiguity and journal cleanup recover forward without overwriting edits', async () => {
  const { io, store } = setup();
  io.failAt = 'save-after';
  await store.commit([{ path: 'A.md', before: null, after: 'A', type: 'daily' }], () => undefined);
  assert.equal(io.files.get('A.md'), 'A');
  assert.equal(io.journal, null);
  io.failAt = null;
  const restarted = new CalendarStore(io, freshState(DEFAULT_SETTINGS));
  await restarted.recover();
  assert.equal(io.journal, null);
  io.failAt = 'clear';
  await restarted.commit([{ path: 'B.md', before: null, after: 'B', type: 'weekly' }], () => undefined);
  assert.ok(io.journal);
  io.files.set('B.md', 'User edit');
  const again = new CalendarStore(io, freshState(DEFAULT_SETTINGS));
  await assert.rejects(again.recover(), /needs attention/);
  assert.equal(io.files.get('B.md'), 'User edit');
});

test('advisory onChange failures cannot roll back a committed transaction', async () => {
  const { io, store } = setup();
  store.onChange = () => { throw new Error('UI failed'); };
  await store.commit([{ path: 'A.md', before: null, after: 'A', type: 'daily' }], () => undefined);
  assert.equal(io.files.get('A.md'), 'A');
  assert.equal(io.data?.pathTypes['a.md']?.type, 'daily');
});

test('direct daily and weekly opening use templates once and reject a shared path', async () => {
  const { io, service, store } = setup();
  store.state.settings.dailyTemplate = 'Templates/Day';
  store.state.settings.weeklyTemplate = 'Templates/Week';
  io.files.set('Templates/Day.md', '# {{date}}\n\nMy journal\n');
  io.files.set('Templates/Week.md', '# {{date}}\n\nWeekly plan\n');
  const daily = await service.openDaily('2026-10-22');
  const weekly = await service.openWeekly('2026-10-22');
  assert.match(io.files.get(daily)!, /2026-10-22[\s\S]*My journal/);
  assert.match(io.files.get(weekly)!, /Weekly plan/);
  assert.match(io.files.get(daily)!, /^# 2026-10-22/m);
  io.files.set(daily, `${io.files.get(daily)}Handwritten\n`);
  await service.openDaily('2026-10-22');
  assert.match(io.files.get(daily)!, /Handwritten/);
  store.state.settings.weeklyFolder = store.state.settings.dailyFolder;
  store.state.settings.weeklyFormat = store.state.settings.dailyFormat;
  await service.openDaily('2026-10-18');
  await assert.rejects(service.openWeekly('2026-10-22'), /conflicts/);
});

test('default Weekly Note starts with a review section without repeating its filename', async () => {
  const { io, service } = setup();
  const path = await service.openWeekly('2026-10-22');
  assert.match(io.files.get(path)!, /^## Weekly review\n/);
  assert.doesNotMatch(io.files.get(path)!, /^# 2026-W43/m);
});

test('Event Note H1 is generated only when its actual basename differs from the original title', () => {
  const event = { id: 'local|one', sourceId: 'local', uid: 'one', title: 'Roadmap', start, end, allDay: false };
  assert.doesNotMatch(newEventNote(event, 'Calendar Notes/Roadmap.md'), /^# Roadmap/m);
  assert.equal(parseEventNote(newEventNote(event, 'Calendar Notes/Roadmap.md'), 'Calendar Notes/Roadmap.md')?.title, 'Roadmap');
  assert.match(newEventNote({ ...event, title: 'A/B' }, 'Calendar Notes/A B.md'), /^# A\/B/m);
  assert.match(newEventNote(event, 'Calendar Notes/2026-Roadmap.md'), /^# Roadmap/m);
});

test('renaming waits for FileManager link completion before changing the tracked Daily bullet', async () => {
  const { io, service, store } = setup();
  const event = await service.createLocal({ title: 'Rename', start, end });
  await service.openEvent(event);
  const old = store.state.noteLinks[event.id];
  const moved = 'Calendar Notes/Retitled.md';
  io.files.set(moved, io.files.get(old.eventPath)!);
  io.files.delete(old.eventPath);
  await service.handleRename({ path: moved, extension: 'md' } as never, old.eventPath);
  assert.equal(store.state.noteLinks[event.id].eventPath, moved);
  assert.deepEqual(store.state.noteLinks[event.id].pendingRename, { oldPath: old.eventPath, newPath: moved });
  assert.match(io.files.get(old.dailyPath)!, /\[\[Calendar Notes\/Rename/);
  const originalDaily = io.files.get(old.dailyPath)!;
  // Obsidian rewrites the wikilink using offsets from its original snapshot.
  io.files.set(old.dailyPath, originalDaily.replace('[[Calendar Notes/Rename|Rename]]', '[[Retitled|Retitled]]'));
  await service.finalizePendingRenames(moved);
  assert.match(io.files.get(old.dailyPath)!, /\[\[Calendar Notes\/Retitled/);
  assert.doesNotMatch(io.files.get(old.dailyPath)!, /\[\[Calendar Notes\/Rename/);
  assert.doesNotMatch(io.files.get(old.dailyPath)!, /\]\] .*\]\]/);
  assert.equal(store.state.noteLinks[event.id].pendingRename, undefined);
});

test('rename with automatic link updates disabled settles the old exact bullet after completion', async () => {
  const { io, service, store } = setup();
  const event = await service.createLocal({ title: 'No auto', start, end });
  const old = store.state.noteLinks[event.id];
  const moved = 'Calendar Notes/No auto renamed.md';
  io.files.set(moved, io.files.get(old.eventPath)!);
  io.files.delete(old.eventPath);
  await service.handleRename({ path: moved, extension: 'md' } as never, old.eventPath);
  const before = io.files.get(old.dailyPath)!;
  assert.match(before, /\[\[Calendar Notes\/No auto\|No auto\]\]/);
  await service.finalizePendingRenames(moved);
  const after = io.files.get(old.dailyPath)!;
  assert.match(after, /\[\[Calendar Notes\/No auto renamed\|No auto renamed\]\]/);
  assert.equal(after.split('No auto renamed').length - 1, 2);
});

test('pending rename survives restart and settles without changing unrelated Daily writing', async () => {
  const { io, service, store } = setup();
  const event = await service.createLocal({ title: 'Restart', start, end });
  const old = store.state.noteLinks[event.id];
  io.files.set(old.dailyPath, io.files.get(old.dailyPath)! + '\nPersonal journal.\n');
  const moved = 'Calendar Notes/Restart moved.md';
  io.files.set(moved, io.files.get(old.eventPath)!);
  io.files.delete(old.eventPath);
  await service.handleRename({ path: moved, extension: 'md' } as never, old.eventPath);
  const restarted = setup(io);
  await restarted.store.recover();
  assert.ok(restarted.store.state.noteLinks[event.id].pendingRename);
  await restarted.service.finalizePendingRenames();
  assert.match(io.files.get(old.dailyPath)!, /Personal journal/);
  assert.match(io.files.get(old.dailyPath)!, /\[\[Calendar Notes\/Restart moved/);
  assert.equal(restarted.store.state.noteLinks[event.id].pendingRename, undefined);
});

test('direct Event Note frontmatter edit reindexes and moves its managed bullet', async () => {
  const { io, service, store } = setup();
  const event = await service.createLocal({ title: 'Manual', start, end });
  await service.openEvent(event);
  const original = store.state.noteLinks[event.id];
  io.files.set(original.eventPath, io.files.get(original.eventPath)!
    .replace(start, '2026-10-24T09:00:00+08:00').replace(end, '2026-10-24T10:00:00+08:00'));
  const events = await service.scanEvents();
  assert.equal(events[0].start, '2026-10-24T09:00:00+08:00');
  assert.match(store.state.noteLinks[event.id].dailyPath, /2026-10-24/);
  assert.doesNotMatch(io.files.get(original.dailyPath)!, /\[\[Calendar Notes\/Manual/);
});

test('invalid paths and a wrong event_id never overwrite an occupied note', async () => {
  const { io, service, store } = setup();
  store.state.settings.eventPattern = '../{title}';
  await assert.rejects(service.createLocal({ title: 'Bad', start, end }), /dot segments/);
  store.state.settings.eventPattern = '[Calendar Notes]/{title}';
  io.files.set('Calendar Notes/Occupied.md', '---\nevent_id: "local|someone-else"\nstart: "2026-10-22T10:00:00+08:00"\nend: "2026-10-22T11:00:00+08:00"\n---\n# Occupied\n');
  const event = await service.createLocal({ title: 'Occupied', start, end });
  await service.openEvent(event);
  assert.match(store.state.noteLinks[event.id].eventPath, /Occupied \(2\)\.md$/);
  assert.match(io.files.get('Calendar Notes/Occupied.md')!, /someone-else/);
});

test('literal true identity and special title stay strings after YAML round trip', () => {
  const event = { id: 'true', sourceId: 'true', uid: 'true', title: 'A [bracket] # plan', start, end, allDay: false };
  const note = newEventNote(event);
  assert.match(note, /event_id: "true"/);
  assert.match(note, /source: "true"/);
  assert.equal(parseEventNote(note, 'Note.md')?.title, event.title);
  assert.equal(writeEventFrontmatter(note, event), note);
});

test('apparent Event heading inside a code fence does not capture a managed bullet', () => {
  const content = '# Journal\n\n```md\n## Event\n```still code\n- example\n```\n\n## Journal\nText\n';
  const result = addEventBullet(content, '- 10:00 [[A]]');
  assert.match(result, /```still code\n- example\n```/);
  assert.match(result, /## Journal\nText\n\n## Event\n\n- 10:00 \[\[A\]\]/);
});

test('invalid Event Note edit keeps the last valid local event visible until repaired', async () => {
  const { io, service, store } = setup();
  const event = await service.createLocal({ title: 'Retain', start, end });
  await service.openEvent(event);
  await service.scanEvents();
  const path = store.state.noteLinks[event.id].eventPath;
  const valid = io.files.get(path)!;
  io.files.set(path, valid.replace(end, 'invalid'));
  assert.equal((await service.scanEvents())[0].id, event.id);
  assert.match(service.diagnostics.join(' '), /Invalid event times|ISO timestamps/);
  io.files.set(path, valid);
  assert.equal((await service.scanEvents())[0].id, event.id);
  assert.equal(service.diagnostics.length, 0);
});

test('duplicate event_id blocks opening either note until ambiguity is resolved', async () => {
  const { io, service } = setup();
  const event = await service.createLocal({ title: 'Duplicate', start, end });
  const first = [...io.files.keys()][0];
  io.files.set('Other.md', io.files.get(first)!);
  assert.equal((await service.scanEvents()).length, 0);
  await assert.rejects(service.openEvent(event), /Duplicate event_id/);
  assert.equal(io.files.get('Other.md'), io.files.get(first));
});
