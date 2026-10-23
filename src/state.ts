import type { PluginSettings } from './types';
import type { SourceCache, ChangeHistoryEntry } from './history';
import { normalizePluginSettings } from './settings';

export type NoteKind = 'event' | 'daily' | 'weekly';

export interface NoteLink {
  eventPath: string;
  dailyPath: string;
  bullet: string;
  /** A moved Event Note awaits Obsidian's completed link update. */
  pendingRename?: { oldPath: string; newPath: string };
}

export interface PathClaim {
  type: NoteKind;
  ownerId?: string;
}

export interface StoredState {
  version: 1;
  settings: PluginSettings;
  noteLinks: Record<string, NoteLink>;
  sourceCaches: Record<string, SourceCache>;
  overrides: Record<string, { start: string; end: string; allDay?: boolean }>;
  history: ChangeHistoryEntry[];
  pathTypes: Record<string, PathClaim>;
}

export function freshState(settings: PluginSettings): StoredState {
  return { version: 1, settings, noteLinks: {}, sourceCaches: {}, overrides: {}, history: [], pathTypes: {} };
}

export function normalizeState(raw: unknown, fallbackSettings: PluginSettings): StoredState {
  const base = freshState(fallbackSettings);
  if (!raw || typeof raw !== 'object') return base;
  const input = raw as Partial<StoredState>;
  return {
    version: 1,
    settings: normalizePluginSettings(input.settings, fallbackSettings),
    noteLinks: input.noteLinks ?? {},
    sourceCaches: input.sourceCaches ?? {},
    overrides: input.overrides ?? {},
    history: input.history ?? [],
    pathTypes: input.pathTypes ?? {},
  };
}

export function pathKey(path: string): string {
  return path.normalize('NFC').toLocaleLowerCase('en-US');
}

export function claimPath(state: StoredState, path: string, type: NoteKind, ownerId?: string): void {
  const key = pathKey(path);
  const current = state.pathTypes[key];
  if (current && (current.type !== type || (type === 'event' && current.ownerId !== ownerId))) {
    throw new Error(`The ${type} Note path conflicts with an existing ${current.type} Note: ${path}`);
  }
  state.pathTypes[key] = { type, ...(ownerId ? { ownerId } : {}) };
}
