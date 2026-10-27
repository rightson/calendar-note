import assert from 'node:assert/strict';
import test from 'node:test';
import { isEventNoteFrontmatter, PropertiesOpenState, shouldRestoreProperties } from '../src/event-properties-state';

const eventFrontmatter = {
  event_id: 'local|test', start: '2026-10-23T12:00:00+08:00', end: '2026-10-23T13:00:00+08:00',
};

test('Properties default applies on each Event Note open, while a manual toggle survives the same open', () => {
  const state = new PropertiesOpenState<object, object>();
  const view = {};
  const eventPanel = {};
  assert.equal(isEventNoteFrontmatter(eventFrontmatter), true);
  assert.equal(state.shouldToggle(view, 'Calendar Notes/Event.md', 'source', eventPanel, false, true), true);
  // A native replacement panel can receive the default during initial settling.
  assert.equal(state.shouldToggle(view, 'Calendar Notes/Event.md', 'source', {}, false, true, true), true);
  // The user manually expands Properties. A subsequent redraw leaves it expanded.
  assert.equal(state.shouldToggle(view, 'Calendar Notes/Event.md', 'source', {}, false, true, true, true), false);
  // The same view displays an ordinary note, then reopens the Event Note quickly.
  state.opened(view);
  assert.equal(isEventNoteFrontmatter({ title: 'Ordinary' }), false);
  state.opened(view);
  assert.equal(state.shouldToggle(view, 'Calendar Notes/Event.md', 'source', {}, false, true), true);
  // Reading view has its own native panel and receives the initial default once.
  assert.equal(state.shouldToggle(view, 'Calendar Notes/Event.md', 'preview', {}, false, true), true);
});

test('current frontmatter is required even if a path was once an Event Note', () => {
  assert.equal(isEventNoteFrontmatter(eventFrontmatter), true);
  assert.equal(isEventNoteFrontmatter({ ...eventFrontmatter, event_id: undefined }), false);
  assert.equal(isEventNoteFrontmatter({ ...eventFrontmatter, start: 'not a timestamp' }), false);
  assert.equal(isEventNoteFrontmatter({ ...eventFrontmatter, end: '2026-10-23T11:00:00+08:00' }), false);
  assert.equal(isEventNoteFrontmatter({ ...eventFrontmatter, event_id: '' }), false);
  assert.equal(isEventNoteFrontmatter({ event_id: 'local|test' }), false);
  assert.equal(isEventNoteFrontmatter({ ...eventFrontmatter, event_id: 'imported', source: 'calendar', ical_uid: 'uid' }), true);
  assert.equal(isEventNoteFrontmatter({ ...eventFrontmatter, event_id: '4de03a64-0d4c-4b16-9b72-3e6805ebdd79' }), true);
});

test('point frontmatter is recognized only with imported source and UID', () => {
  const point = { ...eventFrontmatter, end: eventFrontmatter.start };
  assert.equal(isEventNoteFrontmatter(point), false);
  assert.equal(isEventNoteFrontmatter({ ...point, source: 'work' }), false);
  assert.equal(isEventNoteFrontmatter({ ...point, ical_uid: 'uid-1' }), false);
  assert.equal(isEventNoteFrontmatter({ ...point, source: 'work', ical_uid: 'uid-1' }), false);
  assert.equal(isEventNoteFrontmatter({ ...point, event_id: 'work|uid-1', source: 'work', ical_uid: 'uid-1' }), true);
  assert.equal(isEventNoteFrontmatter({ ...point, event_id: 'work|uid-1', source: 'work', ical_uid: 'uid-1',
    end: '2026-10-23T11:59:59+08:00' }), false);
});

test('opening the same Event Note in another view leaves the first view manual state alone', () => {
  const state = new PropertiesOpenState<object, object>();
  const left = {}, right = {}, path = 'Calendar Notes/Event.md';
  const leftPanel = {}, rightPanel = {};
  assert.equal(state.shouldToggle(left, path, 'source', leftPanel, false, true), true);
  assert.equal(state.shouldToggle(right, path, 'source', rightPanel, false, true), true);
  state.opened(right);
  assert.equal(state.shouldToggle(left, path, 'source', leftPanel, false, true), false);
  assert.equal(state.shouldToggle(right, path, 'source', rightPanel, false, true), true);
});

test('manual toggles survive unload, while an explicit preference change can apply again', () => {
  const state = new PropertiesOpenState<object, object>();
  const view = {}, panel = {}, path = 'Calendar Notes/Event.md';
  assert.equal(state.shouldToggle(view, path, 'source', panel, false, true), true);
  const applied = state.get(view)!;
  assert.equal(shouldRestoreProperties(applied, true, false), true);
  // The user expands then collapses again; the final state equals the default but remains their choice.
  assert.equal(shouldRestoreProperties(applied, true, true), false);
  state.clear(); // An explicit preference change starts a fresh default.
  assert.equal(state.shouldToggle(view, path, 'source', panel, true, false), true);
});
