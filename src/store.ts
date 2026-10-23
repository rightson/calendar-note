import { claimPath, normalizeState, type NoteKind, type StoredState } from './state';

export type { StoredState, NoteLink, NoteKind } from './state';

export interface PlannedWrite {
  path: string;
  before: string | null;
  after: string | null;
  type: NoteKind;
  ownerId?: string;
}

export interface RecoveryJournal {
  version: 1;
  beforeState: StoredState;
  afterState: StoredState;
  writes: PlannedWrite[];
}

/** The adapter must compare current contents with `before` before every mutation. */
export interface StoreIO {
  read(path: string): Promise<string | null>;
  write(path: string, before: string | null, after: string | null): Promise<void>;
  listMarkdown(): Promise<string[]>;
  loadData(): Promise<StoredState | null>;
  saveData(state: StoredState): Promise<void>;
  loadJournal(): Promise<RecoveryJournal | null>;
  saveJournal(journal: RecoveryJournal): Promise<void>;
  clearJournal(): Promise<void>;
}

export class RecoveryConflict extends Error {
  constructor(public readonly paths: string[]) {
    super(`Recovery needs attention: ${paths.join(', ')}`);
  }
}

function clone<T>(value: T): T { return structuredClone(value); }
function same(a: unknown, b: unknown): boolean { return JSON.stringify(a) === JSON.stringify(b); }

export class CalendarStore {
  public state: StoredState;
  public onChange?: () => void;
  public recoveryConflict: RecoveryConflict | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(public readonly io: StoreIO, initialState: StoredState) {
    this.state = clone(initialState);
  }

  private serialized<T>(work: () => Promise<T>): Promise<T> {
    const next = this.queue.then(work, work);
    this.queue = next.then(() => undefined, () => undefined);
    return next;
  }

  async recover(): Promise<void> {
    return this.serialized(async () => {
      const saved = await this.io.loadData();
      if (saved) this.state = normalizeState(saved, this.state.settings);
      const journal = await this.io.loadJournal();
      if (!journal) return;
      const committed = same(saved, journal.afterState);
      const conflicts: string[] = [];
      for (const write of journal.writes) {
        const actual = await this.io.read(write.path);
        const target = committed ? write.after : write.before;
        if (actual === target) continue;
        const expected = committed ? write.before : write.after;
        if (actual !== expected) { conflicts.push(write.path); continue; }
        try { await this.io.write(write.path, expected, target); }
        catch { conflicts.push(write.path); }
      }
      if (conflicts.length) {
        this.recoveryConflict = new RecoveryConflict(conflicts);
        throw this.recoveryConflict;
      }
      if (!committed) this.state = clone(journal.beforeState);
      await this.io.clearJournal();
      this.recoveryConflict = null;
      this.onChange?.();
    });
  }

  async commit(writes: PlannedWrite[], mutate: (state: StoredState) => void): Promise<void> {
    return this.serialized(async () => {
      if (this.recoveryConflict || await this.io.loadJournal()) {
        throw new Error('A pending recovery must be resolved before writing more notes.');
      }
      const beforeState = clone(this.state);
      const afterState = clone(this.state);
      const unique = new Set<string>();
      for (const write of writes) {
        const key = write.path.normalize('NFC').toLocaleLowerCase('en-US');
        if (unique.has(key)) throw new Error(`Duplicate write target: ${write.path}`);
        unique.add(key);
        claimPath(afterState, write.path, write.type, write.ownerId);
      }
      mutate(afterState);
      for (const write of writes) {
        if (await this.io.read(write.path) !== write.before) throw new Error(`Note changed while preparing write: ${write.path}`);
      }
      const journal: RecoveryJournal = { version: 1, beforeState, afterState, writes: clone(writes) };
      await this.io.saveJournal(journal);
      try {
        for (const write of writes) {
          if (write.before === write.after) continue;
          await this.io.write(write.path, write.before, write.after);
        }
        await this.io.saveData(afterState);
      } catch (error) {
        // A persistence call can throw after its bytes have landed. Once the
        // after-state is durable, recovery must roll files forward.
        let committed = false;
        try { committed = same(await this.io.loadData(), afterState); }
        catch {
          this.recoveryConflict = new RecoveryConflict(['plugin state']);
          throw error;
        }
        if (committed) {
          this.state = afterState;
          try { await this.io.clearJournal(); } catch { /* restart recovery finishes cleanup */ }
          try { this.onChange?.(); } catch { /* notifications are advisory */ }
          return;
        }
        const conflicts: string[] = [];
        for (const write of [...writes].reverse()) {
          const actual = await this.io.read(write.path);
          if (actual === write.before) continue;
          if (actual !== write.after) { conflicts.push(write.path); continue; }
          try { await this.io.write(write.path, write.after, write.before); }
          catch { conflicts.push(write.path); }
        }
        if (!conflicts.length) {
          try { await this.io.clearJournal(); }
          catch { conflicts.push('transaction journal'); }
        }
        if (conflicts.length) this.recoveryConflict = new RecoveryConflict(conflicts);
        throw error;
      }
      this.state = afterState;
      try { await this.io.clearJournal(); } catch { /* recovery will finish cleanup */ }
      try { this.onChange?.(); } catch { /* notifications are advisory */ }
    });
  }
}
