import type { Workspace, WorkspaceLeaf } from 'obsidian';

export type CalendarOpenMode = 'tab' | 'right-split';

export function calendarOpenModeForClick(event: Pick<MouseEvent, 'ctrlKey' | 'metaKey'>): CalendarOpenMode {
  return event.ctrlKey || event.metaKey ? 'right-split' : 'tab';
}

/** Always create a leaf; never replace the active note or reuse a previous calendar. */
export async function openCalendarLeaf(workspace: Workspace, viewType: string, mode: CalendarOpenMode): Promise<WorkspaceLeaf> {
  const leaf = mode === 'right-split' ? workspace.getLeaf('split', 'vertical') : workspace.getLeaf('tab');
  await leaf.setViewState({ type: viewType, active: true });
  await workspace.revealLeaf(leaf);
  return leaf;
}

/** Notes opened from the mini calendar alone go in one split beside it, reused while it stays open. */
export function noteSplitLeaf(workspace: Workspace, calendarLeaf: WorkspaceLeaf, previous?: WorkspaceLeaf): WorkspaceLeaf {
  let open = false;
  if (previous && previous !== calendarLeaf) workspace.iterateAllLeaves(leaf => { if (leaf === previous) open = true; });
  return open ? previous! : workspace.createLeafBySplit(calendarLeaf, 'vertical');
}
