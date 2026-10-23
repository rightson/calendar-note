const assert = require('node:assert/strict');
const moment = require('./vendor/moment-with-locales.min.js');
const {weekInfo, weeklyPath, ensureWeeklyNote} = require('./weekly-core.js');

const globalLocale = moment.locale();
const englishWeek = moment.localeData('en').firstDayOfWeek();
assert.deepEqual(
  [weekInfo('2021-01-01', {locale:'en'}).label, weekInfo('2021-01-01', {locale:'en-gb'}).label],
  ['2021-W01', '2020-W53']
);
assert.deepEqual(
  [weekInfo('2021-01-01', {locale:'en',weekStart:'monday'}).start,
    weekInfo('2021-01-01', {locale:'en-gb',weekStart:'sunday'}).start],
  ['2020-12-28', '2020-12-27']
);
assert.equal(weekInfo('2021-01-01', {mode:'iso',locale:'en',weekStart:'sunday'}).label, '2020-W53');
assert.equal(weekInfo('2021-01-01', {mode:'iso',locale:'en',weekStart:'sunday'}).start, '2020-12-28');
assert.equal(weekInfo('2027-01-01', {locale:'en'}).label, '2027-W01');
assert.equal(weekInfo('2027-01-01', {mode:'iso',locale:'en'}).label, '2026-W53');
assert.equal(weekInfo('2027-01-04', {mode:'iso',locale:'en'}).label, '2027-W01');
assert.equal(weekInfo('2026-10-23', {locale:'zh-tw'}).start, '2026-10-18');
assert.equal(weekInfo(moment.parseZone('2026-10-23T10:00:00+08:00'), {locale:'en'}).label, '2026-W43');

assert.equal(weeklyPath(undefined, undefined, '2026-10-23'), 'Weekly Notes/2026-W43.md');
assert.equal(weeklyPath('', '', '2026-10-23'), '2026-W43.md');
assert.equal(weeklyPath('YYYY/週記', 'YYYY/MM/[Week] gggg-[W]ww', '2026-10-23', {locale:'zh-tw'}),
  'YYYY/週記/2026/10/Week 2026-W43.md');
assert.equal(weeklyPath('[Journal] #Weekly/Quarter ^1', '', '2026-10-23'),
  '[Journal] #Weekly/Quarter ^1/2026-W43.md');
const longFolder = 'A'.repeat(190);
assert.equal(weeklyPath(longFolder, '', '2026-10-23'), longFolder + '/2026-W43.md');
assert.equal(weeklyPath('Cafe\u0301', '', '2026-10-23'), 'Café/2026-W43.md');
assert.equal(weeklyPath('', 'YYYY/MM/gggg-[W]ww', '2021-01-01', {locale:'en'}),
  '2020/12/2021-W01.md');
assert.equal(weeklyPath('', 'gggg-[W]ww', '2021-01-01', {locale:'en'}), '2021-W01.md');
assert.equal(weeklyPath('', 'GGGG-[W]WW', '2021-01-01', {locale:'en'}), '2020-W52.md');
assert.equal(weeklyPath('', 'gggg-[W]ww', '2021-01-01', {mode:'iso',locale:'en'}), '2020-W53.md');
assert.equal(weeklyPath('', '[Records]/gggg-[W]ww', '2026-10-23'), 'Records/2026-W43.md');

const weeklyNotes = {}, eventNotes = {}, dailyNotes = {};
const first = ensureWeeklyNote(weeklyNotes, eventNotes, dailyNotes, 'Weekly Notes', 'gggg-[W]ww', '2026-10-18');
assert.equal(first.created, true);
assert.equal(first.note.content, '# Week 43\n\n2026-10-18 – 2026-10-24\n\n## Weekly review\n\n');
first.note.content += 'A preserved thought.\n';
const savedContent = first.note.content;
for (let day = 18; day <= 24; day++) {
  const opened = ensureWeeklyNote(weeklyNotes, eventNotes, dailyNotes, 'Weekly Notes', 'gggg-[W]ww', `2026-10-${day}`);
  assert.equal(opened.key, first.key);
  assert.equal(opened.note.content, savedContent);
  assert.equal(opened.created, false);
}
assert.equal(Object.keys(weeklyNotes).length, 1);
assert.equal(
  ensureWeeklyNote(weeklyNotes, eventNotes, dailyNotes, 'Weekly Notes', 'gggg-[W]ww', '2026-10-23T23:45:00+08:00').key,
  first.key
);
const mondayNotes = {};
for (let day = 19; day <= 25; day++) {
  assert.equal(ensureWeeklyNote(mondayNotes, {}, {}, '', '', `2026-10-${day}`, {weekStart:'monday'}).week.start, '2026-10-19');
}
assert.equal(Object.keys(mondayNotes).length, 1);
const reloaded = JSON.parse(JSON.stringify(weeklyNotes));
assert.equal(ensureWeeklyNote(reloaded, {}, {}, 'Weekly Notes', 'gggg-[W]ww', '2026-10-23').note.content, savedContent);

const aliases = {'legacy-key':{path:'WEEKLY NOTES/2026-w43.md',content:'Existing alias content\n'}};
const alias = ensureWeeklyNote(aliases, {}, {}, 'Weekly Notes', 'gggg-[W]ww', '2026-10-23');
assert.equal(alias.created, false);
assert.equal(alias.note.content, 'Existing alias content\n');
assert.equal(aliases[alias.key], alias.note);
assert.equal(Object.keys(aliases).length, 1);

const shared = {};
const firstShared = ensureWeeklyNote(shared, {}, {}, '', 'YYYY-MM', '2026-10-19', {mode:'iso'});
firstShared.note.content = 'Existing October review\n';
const secondShared = ensureWeeklyNote(shared, {}, {}, '', 'YYYY-MM', '2026-10-26', {mode:'iso'});
assert.equal(secondShared.created, false);
assert.equal(secondShared.note.content, 'Existing October review\n');
assert.equal(Object.keys(shared).length, 1);

const before = JSON.stringify(weeklyNotes);
eventNotes.e = {path:'weekly notes/2026-w43.md',content:'Event content\n'};
assert.throws(() => ensureWeeklyNote(weeklyNotes, eventNotes, {}, 'Weekly Notes', '', '2026-10-23'), /existing Event Note/);
assert.equal(JSON.stringify(weeklyNotes), before);
assert.equal(eventNotes.e.content, 'Event content\n');
dailyNotes.d = {path:'WEEKLY NOTES/2026-W43.MD',content:'Daily content\n'};
assert.throws(() => ensureWeeklyNote(weeklyNotes, {}, dailyNotes, 'Weekly Notes', '', '2026-10-23'), /existing Daily Note/);
assert.equal(JSON.stringify(weeklyNotes), before);

const decomposed = {'d':{path:'cafe\u0301/2026-w43.md',content:'Daily content\n'}};
assert.throws(() => ensureWeeklyNote({}, {}, decomposed, 'Café', '', '2026-10-23'), /existing Daily Note/);
for (const folder of ['/absolute', '../escape', 'Notes/../escape', 'Notes//escape', 'C:/Notes', 'Notes\\Elsewhere', 'Notes/{title}']) {
  assert.throws(() => weeklyPath(folder, '', '2026-10-23'));
}
for (const folder of ['Notes/<Bad>', 'Notes/Trailing.', 'Notes/Trailing ', 'Notes/CON.txt', 'A'.repeat(256)]) {
  assert.throws(() => weeklyPath(folder, '', '2026-10-23'));
}
for (const format of ['/absolute', '../escape', 'Notes/../escape', '[Notes]/{title}', '[Notes]/{calendar}', '[Notes]/{uid}']) {
  assert.throws(() => weeklyPath('', format, '2026-10-23'));
}
assert.throws(() => weeklyPath('', '', '2026-02-30'), /valid calendar date/);
assert.throws(() => weeklyPath('', '', undefined), /valid calendar date/);
assert.throws(() => weekInfo('2026-10-23', {locale:'unknown-locale'}), /supported Moment locale/);
assert.equal(moment.locale(), globalLocale);
assert.equal(moment.localeData('en').firstDayOfWeek(), englishWeek);
assert.equal(moment('2021-01-01').locale('en').format('gggg-[W]ww'), '2021-W01');
console.log('Weekly Note checks passed: Calendar and ISO weeks, path formats, preservation, reload, aliases, collisions, validation and locale isolation.');
