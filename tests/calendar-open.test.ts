import assert from 'node:assert/strict';
import test from 'node:test';
import type { Workspace, WorkspaceLeaf } from 'obsidian';
import { calendarOpenModeForClick, openCalendarLeaf } from '../src/calendar-open';

const viewType = 'calendar-note-view';

test('only Ctrl or Cmd changes a ribbon click to a right split', () => {
  assert.equal(calendarOpenModeForClick({ ctrlKey: false, metaKey: false }), 'tab');
  assert.equal(calendarOpenModeForClick({ ctrlKey: true, metaKey: false }), 'right-split');
  assert.equal(calendarOpenModeForClick({ ctrlKey: false, metaKey: true }), 'right-split');
  assert.equal(calendarOpenModeForClick({ ctrlKey: true, metaKey: true }), 'right-split');
});

function fakeWorkspace() {
  const calls: string[] = [];
  const activeNote = { view: { getViewType: () => 'markdown' }, path: 'Notes/Current.md' };
  const oldCalendar = { view: { getViewType: () => viewType } };
  const created: Array<{ mode: string; leaf: WorkspaceLeaf }> = [];
  const workspace = {
    activeLeaf: activeNote,
    getLeavesOfType: () => [oldCalendar],
    getLeaf(mode: string, direction?: string) {
      calls.push(`getLeaf:${mode}:${direction ?? ''}`);
      const leaf = {
        view: { getViewType: () => 'empty' },
        async setViewState(state: { type: string; active: boolean }) {
          calls.push(`setViewState:${state.type}:${state.active}`);
          this.view = { getViewType: () => state.type };
        },
      };
      created.push({ mode, leaf: leaf as unknown as WorkspaceLeaf });
      return leaf as unknown as WorkspaceLeaf;
    },
    async revealLeaf(leaf: WorkspaceLeaf) {
      assert.equal(leaf, created.at(-1)?.leaf);
      calls.push('revealLeaf');
    },
  } as unknown as Workspace;
  return { workspace, calls, activeNote, oldCalendar, created };
}

test('normal opening creates a fresh tab, then reveals it without replacing the active note', async () => {
  const { workspace, calls, activeNote, oldCalendar, created } = fakeWorkspace();
  const leaf = await openCalendarLeaf(workspace, viewType, 'tab');
  assert.equal(leaf, created[0].leaf);
  assert.notEqual(leaf, oldCalendar);
  assert.equal(workspace.activeLeaf, activeNote);
  assert.equal(activeNote.view.getViewType(), 'markdown');
  assert.deepEqual(calls, ['getLeaf:tab:', `setViewState:${viewType}:true`, 'revealLeaf']);
});

test('modified opening creates a vertical split to the right before revealing it', async () => {
  const { workspace, calls, activeNote, created } = fakeWorkspace();
  const leaf = await openCalendarLeaf(workspace, viewType, 'right-split');
  assert.equal(leaf, created[0].leaf);
  assert.equal(created[0].mode, 'split');
  assert.equal(workspace.activeLeaf, activeNote);
  assert.deepEqual(calls, ['getLeaf:split:vertical', `setViewState:${viewType}:true`, 'revealLeaf']);
});
