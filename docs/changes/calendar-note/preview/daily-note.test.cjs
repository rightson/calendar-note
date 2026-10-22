const assert = require('node:assert/strict');
const core = require('./event-core.js');

// ISO week-years follow the Thursday rule, including weeks spanning calendar years.
for (const [date, label] of [
  ['2020-12-31', '2020-W53'],
  ['2021-01-01', '2020-W53'],
  ['2021-01-04', '2021-W01'],
  ['2025-12-29', '2026-W01'],
  ['2027-01-01', '2026-W53']
]) assert.equal(core.isoWeekLabel(date + 'T12:00:00+08:00'), label);
assert.equal(core.isoWeekLabel('2027-01-01T00:00:00+09:00'), '2026-W53');

const notes = {};
const pattern = '[Daily Notes]/YYYY-MM-DD';
const opened = core.ensureDirectDailyNote(notes, {}, pattern, '2026-10-21', 'en');
assert.equal(opened.created, true);
assert.equal(opened.note.path, 'Daily Notes/2026-10-21.md');
assert.equal(opened.note.content, '# 2026-10-21\n\n## Journal\n\n');
assert.equal(Object.keys(notes).length, 1);
notes[opened.key].content += 'A preserved thought.\n';
const preservedContent = notes[opened.key].content;
const reopened = core.ensureDirectDailyNote(notes, {}, pattern, '2026-10-21', 'en');
assert.equal(reopened.created, false);
assert.equal(reopened.note.content, preservedContent);
const afterReload = JSON.parse(JSON.stringify(notes));
assert.equal(core.ensureDirectDailyNote(afterReload, {}, pattern, '2026-10-21', 'en').note.content, preservedContent);

// A shared date pattern deliberately resolves several dates to the same file.
const shared = {};
const first = core.ensureDirectDailyNote(shared, {}, '[Daily Notes]/YYYY-MM', '2026-10-21', 'en');
first.note.content = '# Shared October note\n\nKeep this text.\n';
const second = core.ensureDirectDailyNote(shared, {}, '[Daily Notes]/YYYY-MM', '2026-10-22', 'en');
assert.equal(second.created, false);
assert.equal(second.note.path, first.note.path);
assert.equal(second.note.content, first.note.content);
assert.equal(Object.keys(shared).length, 1);

// Event-triggered and direct date opening use the same UTC+8 date-only path.
const morning = {start:'2026-10-21T08:30:00+08:00',title:'Morning',uid:'a'};
const evening = {start:'2026-10-21T23:45:00+08:00',title:'Evening',uid:'b'};
const timePattern = '[Daily Notes]/YYYY-MM-DD/HH-mm';
assert.equal(core.dailyPath(timePattern, morning, 'en'), 'Daily Notes/2026-10-21/00-00.md');
assert.equal(core.dailyPath(timePattern, evening, 'en'), core.dailyPath(timePattern, morning, 'en'));
assert.equal(core.ensureDirectDailyNote({}, {}, timePattern, '2026-10-21', 'en').note.path, core.dailyPath(timePattern, morning, 'en'));
assert.equal(core.dailyPath('[Daily Notes]/YYYY/MMMM/DD', morning, 'zh-tw'), 'Daily Notes/2026/十月/21.md');
for (const variable of ['{title}', '{calendar}', '{uid}']) assert.throws(() => core.dailyPath('[Daily Notes]/' + variable, morning, 'en'), /date tokens only/);
assert.equal(core.dailyPath('[Daily Notes]/[literal {title}]/YYYY-MM-DD', morning, 'en'), 'Daily Notes/literal {title}/2026-10-21.md');
assert.equal(core.dailyPath('[Daily Notes]/\\{title}/YYYY-MM-DD', morning, 'en'), 'Daily Notes/{title}/2026-10-21.md');

const occupied = {'event-1':{path:'daily notes/2026-10-21.md',content:'Event content must survive.\n'}};
const before = JSON.stringify(notes);
assert.throws(() => core.ensureDirectDailyNote(notes, occupied, pattern, '2026-10-21', 'en'), /matches an existing Event Note/);
assert.equal(JSON.stringify(notes), before);
assert.equal(occupied['event-1'].content, 'Event content must survive.\n');
assert.throws(() => core.ensureDirectDailyNote({}, {}, '[Daily Notes]/{title}', '2026-10-21', 'en'), /date tokens only/);
assert.throws(() => core.ensureDirectDailyNote({}, {}, pattern, '2026-02-30', 'en'), /valid calendar date/);

// An event opened after a direct date note adds only its tracked link.
const event = {source:'local',uid:'one',title:'Discussion',start:'2026-10-21T10:00:00+08:00',end:'2026-10-21T11:00:00+08:00'};
const linked = core.upsertDailyEvent(notes[opened.key].content, event, 'Calendar Notes/Discussion.md');
assert.ok(linked.content.includes('A preserved thought.'));
assert.ok(linked.content.includes('## Event\n'));
assert.ok(!notes[opened.key].content.includes('## Event'));
assert.equal(core.upsertDailyEvent(linked.content, event, 'Calendar Notes/Discussion.md', linked.bullet).content, linked.content);
console.log('Daily Note checks passed: ISO week-years, no-event creation, preservation, reload, shared paths, date-only formatting and path collisions.');
