import assert from 'node:assert/strict';
import test from 'node:test';
import { calendarVisibility, describeProblem, noteEvent, lineDiff, mergeNoteText, problemKey, recommendKeep, sortProblems, summarizeNote, uniqueLines, userContent, type NoteFacts } from '../src/note-problems';

const note = '---\nevent_id: "local|a"\nstart: "2026-10-22T10:00:00+08:00"\nend: "2026-10-22T11:00:00+08:00"\ntags: [x]\n---\n# Plan\n\nAgenda\n';

test('line diff marks what only one side has', () => {
  assert.deepEqual(lineDiff('a\nb\nc\n', 'a\nc\nd'), [
    { type: 'same', text: 'a' }, { type: 'removed', text: 'b' }, { type: 'same', text: 'c' }, { type: 'added', text: 'd' },
  ]);
  assert.deepEqual(lineDiff('same\r\n', 'same\n'), [{ type: 'same', text: 'same' }]);
});

test('lines unique to a copy ignore event properties and blank lines', () => {
  const copy = note.replace('local|a', 'local|b').replace('Agenda\n', 'Agenda\n\nDecisions\n');
  assert.deepEqual(uniqueLines(note, copy), ['Decisions']);
  assert.deepEqual(uniqueLines(note, note.replace('10:00:00', '12:00:00')), []);
  assert.equal(userContent(note), '---\ntags: [x]\n---\n# Plan\n\nAgenda');
});

test('the recommended note is the linked one, then the listed one, then the one with most text', () => {
  const facts = (path: string, content: string, extra: Partial<NoteFacts> = {}): NoteFacts => ({ path, content, linked: false, listed: false, references: [], ...extra });
  assert.equal(recommendKeep([facts('a.md', 'long text'), facts('b.md', 'x', { linked: true })]).path, 'b.md');
  assert.equal(recommendKeep([facts('a.md', 'long text'), facts('b.md', 'x', { listed: true })]).path, 'b.md');
  assert.equal(recommendKeep([facts('a.md', 'x'), facts('b.md', 'long text')]).path, 'b.md');
  assert.deepEqual(recommendKeep([facts('a.md', 'x', { mtime: 2 }), facts('b.md', 'y', { mtime: 1 })]),
    { path: 'b.md', reason: 'The notes are the same size; this one was changed first.' });
  assert.equal(recommendKeep([facts('a.md', 'x', { linked: true })], 'c.md').path, 'c.md');
});

test('merging appends only a copy with its own text, without its title heading', () => {
  const copy = note.replace('Agenda\n', 'Agenda\nDecisions\n');
  assert.equal(mergeNoteText(note, copy, 'Notes/Plan 1.md'), `${note}\n## Merged from Plan 1\n\nAgenda\nDecisions\n`);
  assert.equal(mergeNoteText(note, note, 'Notes/Plan 1.md'), note);
  assert.equal(mergeNoteText(note, '---\nevent_id: "x"\n---\n# Plan\n', 'Plan 1.md'), note);
});

test('a note summary lists properties, or the raw lines when YAML is invalid', () => {
  assert.deepEqual(summarizeNote(note).properties.map(([key]) => key), ['event_id', 'start', 'end', 'tags']);
  const broken = summarizeNote('---\nevent_id: "a"\ntags: [\n---\nBody\n');
  assert.ok(broken.yamlError);
  assert.deepEqual(broken.properties, [['event_id', '"a"'], ['tags', '[']]);
  assert.equal(broken.body, 'Body\n');
});

test('problems are ordered by kind and described in plain words', () => {
  const problems = sortProblems([
    { kind: 'invalid', paths: ['b.md'], message: 'b.md: bad' },
    { kind: 'duplicate', paths: ['c.md', 'a.md'], message: 'c.md: dup' },
  ]);
  assert.deepEqual(problems.map(problem => problem.kind), ['duplicate', 'invalid']);
  assert.equal(problemKey(problems[0]), 'duplicate:a.md\nc.md');
  assert.equal(describeProblem(problems[0], id => id).title, '2 notes claim the same event');
  assert.equal(describeProblem({ kind: 'unlisted', paths: ['a.md'], message: '', sourceId: 'work' }, () => 'Work').title, 'Not in calendar “Work”');
});

test('an invalid note still says which event it is about', () => {
  assert.deepEqual(noteEvent('---\nevent_id: "work|uid"\nstart: "2026-10-24T10:00:00+08:00"\nend: "soon"\n---\n# Retro\n', 'Notes/x.md'),
    { title: 'Retro', start: '2026-10-24T10:00:00+08:00', end: 'soon', allDay: false, sourceId: 'work' });
  assert.deepEqual(noteEvent('---\nevent_id: "local|a"\ntags: [\n---\n', 'Notes/Plan.md'), { title: 'Plan', start: undefined, end: undefined, allDay: false, sourceId: undefined });
  assert.match(calendarVisibility({ kind: 'orphan', paths: ['a.md'], message: '' }), /Not shown/);
});
