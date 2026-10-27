import { isImportedEventIdentity, validateInterval, validateSourceInterval } from './notes';

export function isEventNoteFrontmatter(frontmatter: Record<string, unknown> | undefined): boolean {
  if (typeof frontmatter?.event_id !== 'string' || !frontmatter.event_id.trim()
    || typeof frontmatter.start !== 'string' || typeof frontmatter.end !== 'string') return false;
  try {
    const imported = isImportedEventIdentity(frontmatter.event_id,
      typeof frontmatter.source === 'string' ? frontmatter.source : undefined,
      typeof frontmatter.ical_uid === 'string' ? frontmatter.ical_uid : undefined);
    (imported ? validateSourceInterval : validateInterval)(frontmatter.start, frontmatter.end, frontmatter.all_day === true);
  }
  catch { return false; }
  return true;
}

export interface AppliedProperties<Panel> {
  path: string;
  mode: string;
  element: Panel;
  originalCollapsed: boolean;
  targetCollapsed: boolean;
}

export function shouldRestoreProperties<Panel>(applied: AppliedProperties<Panel>, collapsed: boolean, manuallyToggled: boolean): boolean {
  return !manuallyToggled && applied.originalCollapsed !== applied.targetCollapsed && collapsed === applied.targetCollapsed;
}

/** Remember only the first default applied for each opened file and view mode. */
export class PropertiesOpenState<View, Panel> {
  private applied = new Map<View, AppliedProperties<Panel>>();

  opened(view: View): void { this.applied.delete(view); }
  get(view: View): AppliedProperties<Panel> | undefined { return this.applied.get(view); }
  drop(view: View): void { this.applied.delete(view); }
  clear(): void { this.applied.clear(); }
  entries(): IterableIterator<[View, AppliedProperties<Panel>]> { return this.applied.entries(); }

  shouldToggle(view: View, path: string, mode: string, element: Panel, collapsed: boolean, targetCollapsed: boolean,
    retryNewPanel = false, manuallyToggled = false): boolean {
    const previous = this.applied.get(view);
    if (previous?.path === path && previous.mode === mode
      && (previous.element === element || !retryNewPanel || manuallyToggled)) return false;
    this.applied.set(view, { path, mode, element, originalCollapsed: collapsed, targetCollapsed });
    return collapsed !== targetCollapsed;
  }
}
