import type { Workspace, WorkspaceLeaf, WorkspaceParent, WorkspaceSplit } from 'obsidian';

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

/** Layout fields Obsidian keeps on workspace items at runtime but leaves out of its typings. */
interface LayoutItem { parent?: LayoutItem | null; children?: LayoutItem[]; direction?: string }

function newTabAfter(workspace: Workspace, anchor: WorkspaceLeaf): WorkspaceLeaf {
  const tabs = anchor.parent as unknown as LayoutItem;
  return workspace.createLeafInParent(tabs as unknown as WorkspaceSplit, (tabs.children?.indexOf(anchor as unknown as LayoutItem) ?? -1) + 1);
}

function recentLeafIn(workspace: Workspace, item: LayoutItem): WorkspaceLeaf | undefined {
  const recent = workspace.getMostRecentLeaf(item as unknown as WorkspaceParent);
  if (recent) return recent;
  const leaves: WorkspaceLeaf[] = [];
  workspace.iterateAllLeaves(leaf => {
    for (let node: LayoutItem | null | undefined = leaf as unknown as LayoutItem; node; node = node.parent) if (node === item) { leaves.push(leaf); return; }
  });
  return leaves[0];
}

/**
 * A new tab on the far side of the calendar: in the main area when the calendar
 * sits in a sidebar, otherwise in the nearest pane beside it (the left one when
 * there is one, so a calendar on the right opens notes on the left and a
 * calendar on the left opens them on the right). Undefined when nothing is beside it.
 */
export function oppositeTabLeaf(workspace: Workspace, calendarLeaf: WorkspaceLeaf): WorkspaceLeaf | undefined {
  const root = calendarLeaf.getRoot();
  if (root === workspace.leftSplit || root === workspace.rightSplit) {
    const anchor = recentLeafIn(workspace, workspace.rootSplit as unknown as LayoutItem);
    return anchor && newTabAfter(workspace, anchor);
  }
  for (let node = calendarLeaf.parent as unknown as LayoutItem; node.parent; node = node.parent) {
    const { children, direction } = node.parent;
    if (direction !== 'vertical' || !children) continue;
    const index = children.indexOf(node);
    const neighbour = children[index > 0 ? index - 1 : index + 1];
    const anchor = neighbour && recentLeafIn(workspace, neighbour);
    if (anchor) return newTabAfter(workspace, anchor);
  }
  return undefined;
}

/**
 * Notes opened beside the calendar go in one leaf, reused while it stays open:
 * a new tab on the far side when a pane is already there, else a split of the calendar.
 */
export function noteSplitLeaf(workspace: Workspace, calendarLeaf: WorkspaceLeaf, previous?: WorkspaceLeaf): WorkspaceLeaf {
  let open = false;
  if (previous && previous !== calendarLeaf) workspace.iterateAllLeaves(leaf => { if (leaf === previous) open = true; });
  return open ? previous! : oppositeTabLeaf(workspace, calendarLeaf) ?? workspace.createLeafBySplit(calendarLeaf, 'vertical');
}
