import { Modal, Notice, Setting, SuggestModal, normalizePath, type App } from 'obsidian';
import moment from 'moment-timezone';
import type { CalendarEvent, Interval, PluginSettings } from './types';
import type { ChangeHistoryEntry } from './history';
import { historyForReview } from './history';
import { intervalFromFields } from './calendar-input';
import { dateAt } from './date';

function fieldDate(value: string, allDay: boolean, zone: string): string {
  return dateAt(value, zone).format(allDay ? 'YYYY-MM-DD' : 'YYYY-MM-DDTHH:mm');
}

export class EventModal extends Modal {
  private titleValue: string;
  private startValue: string;
  private endValue: string;
  private allDay: boolean;
  private errorEl!: HTMLElement;

  constructor(app: Modal['app'], private settings: PluginSettings,
    private submit: (value: { title: string; interval: Interval }) => Promise<void>, private event?: CalendarEvent,
    initial?: Interval, private note?: { path?: string; change: () => void }) {
    super(app);
    this.titleValue = event?.title ?? '';
    this.allDay = event?.allDay ?? initial?.allDay ?? false;
    const start = event?.start ?? initial?.start ?? moment().toISOString();
    const end = event?.end ?? initial?.end ?? dateAt(start, settings.timeZone).add(settings.defaultDurationMinutes, 'minutes').toISOString();
    this.startValue = fieldDate(start, this.allDay, settings.timeZone);
    this.endValue = fieldDate(end, this.allDay, settings.timeZone);
  }

  onOpen(): void {
    this.titleEl.setText('Event details');
    const root = this.contentEl;
    root.empty();
    const titleField = root.createDiv({ cls: 'cn-modal-field cn-title-field' });
    const titleLabel = titleField.createEl('label', { text: 'Title' });
    const titleInput = titleLabel.createEl('input', { type: 'text', cls: 'cn-event-title', attr: { placeholder: 'Event title' } });
    titleInput.value = this.titleValue;
    titleInput.disabled = !!this.event;
    titleInput.addEventListener('input', () => { this.titleValue = titleInput.value; });
    if (this.event) titleField.createEl('small', { text: 'Edit the title in the Event Note.', cls: 'cn-muted' });
    let startInput: HTMLInputElement;
    let endInput: HTMLInputElement;
    const makeInput = (label: string, value: string, onChange: (value: string) => void) => {
      const row = root.createDiv({ cls: 'cn-modal-field' });
      row.createEl('label', { text: label });
      const input = row.createEl('input', { type: this.allDay ? 'date' : 'datetime-local' });
      input.value = value;
      input.addEventListener('change', () => onChange(input.value));
      return input;
    };
    startInput = makeInput('Start', this.startValue, value => { this.startValue = value; });
    endInput = makeInput('End (exclusive for all-day events)', this.endValue, value => { this.endValue = value; });
    new Setting(root).setName('All day').addToggle(toggle => toggle.setValue(this.allDay).onChange(value => {
      this.startValue = this.startValue.slice(0, 10);
      this.endValue = this.endValue.slice(0, 10);
      if (value && this.endValue <= this.startValue) {
        this.endValue = moment.tz(this.startValue, 'YYYY-MM-DD', true, this.settings.timeZone).add(1, 'day').format('YYYY-MM-DD');
      } else if (!value) {
        this.startValue += 'T09:00';
        this.endValue += 'T10:00';
      }
      this.allDay = value;
      startInput.type = value ? 'date' : 'datetime-local';
      endInput.type = value ? 'date' : 'datetime-local';
      startInput.value = this.startValue;
      endInput.value = this.endValue;
    }));
    if (this.note) {
      const change = this.note.change;
      new Setting(root).setName('Event Note').setDesc(this.note.path ?? 'Not created yet')
        .addButton(button => button.setButtonText('Change…').onClick(() => { this.close(); change(); }));
    }
    this.errorEl = root.createDiv({ cls: 'cn-validation', attr: { role: 'alert' } });
    const actions = root.createDiv({ cls: 'cn-modal-actions' });
    actions.createEl('button', { text: 'Cancel' }).addEventListener('click', () => this.close());
    const save = actions.createEl('button', { text: 'Save event', cls: 'mod-cta' });
    save.addEventListener('click', () => { void (async () => {
      try {
        const title = this.titleValue.trim();
        if (!title) throw new Error('Enter an event title.');
        const interval = intervalFromFields(this.startValue, this.endValue, this.allDay, this.settings.timeZone);
        save.disabled = true;
        await this.submit({ title, interval });
        this.close();
      } catch (error) {
        this.errorEl.setText(error instanceof Error ? error.message : 'Could not save the event.');
        save.disabled = false;
      }
    })(); });
    if (!this.event) titleInput.focus();
  }
}

export interface HistoryActions {
  openExisting(entry: ChangeHistoryEntry): Promise<void>;
  review(entry: ChangeHistoryEntry): Promise<void>;
  retry(entry: ChangeHistoryEntry): Promise<boolean>;
  useLatest(entry: ChangeHistoryEntry): Promise<boolean>;
  canRetry(entry: ChangeHistoryEntry): boolean;
  canUseLatest(entry: ChangeHistoryEntry): boolean;
}

export class ChangeHistoryModal extends Modal {
  private filter: 'all' | 'review' = 'review';
  constructor(app: Modal['app'], private getEntries: () => ChangeHistoryEntry[],
    private getSettings: () => PluginSettings, private actions: HistoryActions) { super(app); }

  onOpen(): void { this.render(); }

  private render(): void {
    this.titleEl.setText('Calendar change history');
    this.contentEl.empty();
    const tabs = this.contentEl.createDiv({ cls: 'cn-history-tabs' });
    for (const [key, label] of [['all', 'All'], ['review', 'Needs review']] as const) {
      const button = tabs.createEl('button', { text: label, cls: key === this.filter ? 'is-active' : '' });
      button.setAttribute('aria-pressed', String(key === this.filter));
      button.addEventListener('click', () => { this.filter = key; this.render(); });
    }
    const all = [...this.getEntries()].sort((a, b) => b.detectedAt.localeCompare(a.detectedAt));
    const entries = this.filter === 'review' ? historyForReview(all) : all;
    if (!entries.length) this.contentEl.createEl('p', { text: 'No changes in this view.' });
    for (const entry of entries) this.renderEntry(entry);
  }

  private renderEntry(entry: ChangeHistoryEntry): void {
    const zone = this.getSettings().timeZone;
    const card = this.contentEl.createDiv({ cls: 'cn-history-entry' });
    card.createEl('strong', { text: `${entry.title} · ${entry.sourceName}` });
    card.createEl('div', { text: `${entry.status.replaceAll('_', ' ')} · ${dateAt(entry.detectedAt, zone).format('lll')}`, cls: 'cn-muted' });
    const range = (value?: { start: string; end: string; allDay: boolean }) => value
      ? `${dateAt(value.start, zone).format(value.allDay ? 'YYYY-MM-DD' : 'YYYY-MM-DD HH:mm')} → ${dateAt(value.end, zone).format(value.allDay ? 'YYYY-MM-DD' : 'YYYY-MM-DD HH:mm')}` : '—';
    card.createEl('div', { text: `Source: ${range(entry.beforeSource)} → ${range(entry.afterSource)}` });
    card.createEl('div', { text: `Effective: ${range(entry.beforeEffective)} → ${range(entry.afterEffective)}` });
    if (entry.notePath) card.createEl('div', { text: `Event Note: ${entry.notePath}` });
    if (entry.beforeDailyPath || entry.afterDailyPath) card.createEl('div', {
      text: `Daily Note: ${entry.beforeDailyPath ?? '—'} → ${entry.afterDailyPath ?? '—'}` });
    if (entry.error) card.createEl('div', { text: entry.error, cls: 'cn-validation' });
    const actions = card.createDiv({ cls: 'cn-history-actions' });
    const action = (label: string, run: () => Promise<void>) => {
      const button = actions.createEl('button', { text: label });
      button.addEventListener('click', () => { void (async () => {
        button.disabled = true;
        try { await run(); this.render(); }
        catch (error) { new Notice(error instanceof Error ? error.message : 'Action failed.'); button.disabled = false; }
      })(); });
      return button;
    };
    if (entry.notePath) action('Open note', () => this.actions.openExisting(entry));
    if (!entry.reviewedAt) action('Mark reviewed', () => this.actions.review(entry));
    if (entry.status === 'needs_attention' && this.actions.canRetry(entry)) action('Retry', async () => {
      if (!await this.actions.retry(entry)) new Notice('The source revision changed. Refresh before retrying.');
    });
    if (entry.status === 'local_override' && this.actions.canUseLatest(entry)) action('Use latest source times', async () => {
      if (!await this.actions.useLatest(entry)) new Notice('The latest source times are unavailable.');
    });
  }
}

/** Picks which of several Event Notes left by a removed calendar keeps the clicked event. */
export class NoteChoiceModal extends SuggestModal<string> {
  private chosen?: string;
  private resolve?: (path: string | undefined) => void;

  constructor(app: App, private readonly paths: string[]) {
    super(app);
    this.setPlaceholder('Several notes match this event. Choose the one to keep');
  }

  choose(): Promise<string | undefined> {
    return new Promise(resolve => { this.resolve = resolve; this.open(); });
  }

  getSuggestions(query: string): string[] {
    const text = query.toLowerCase();
    return this.paths.filter(path => path.toLowerCase().includes(text));
  }

  renderSuggestion(path: string, el: HTMLElement): void { el.setText(path); }

  onChooseSuggestion(path: string): void { this.chosen = path; }

  onClose(): void {
    super.onClose();
    // Obsidian closes the modal before it reports the chosen suggestion.
    window.setTimeout(() => this.resolve?.(this.chosen), 0);
  }
}

export interface NoteTarget { path: string; create: boolean }

/** Picks an existing Markdown note, or a new path, to become an event's Event Note. */
export class LinkNoteModal extends SuggestModal<NoteTarget> {
  private chosen?: string;
  private resolve?: (path: string | undefined) => void;

  constructor(app: App, private readonly current?: string) {
    super(app);
    this.setPlaceholder('Choose a note for this event, or type a new note path');
    this.emptyStateText = 'No matching note.';
  }

  choose(): Promise<string | undefined> {
    return new Promise(resolve => { this.resolve = resolve; this.open(); });
  }

  getSuggestions(query: string): NoteTarget[] {
    const text = query.trim().toLowerCase();
    const paths = this.app.vault.getMarkdownFiles().map(file => file.path).filter(path => path !== this.current);
    const matches = paths.filter(path => path.toLowerCase().includes(text))
      .sort((a, b) => Number(!basename(a).toLowerCase().startsWith(text)) - Number(!basename(b).toLowerCase().startsWith(text)) || a.localeCompare(b))
      .map(path => ({ path, create: false }));
    if (!text) return matches;
    const typed = normalizePath(/\.md$/i.test(query.trim()) ? query.trim() : `${query.trim()}.md`);
    const exists = this.app.vault.getAbstractFileByPath(typed) !== null;
    return exists ? matches : [...matches, { path: typed, create: true }];
  }

  renderSuggestion(target: NoteTarget, el: HTMLElement): void {
    el.setText(target.create ? `Create ${target.path}` : target.path);
  }

  onChooseSuggestion(target: NoteTarget): void { this.chosen = target.path; }

  onClose(): void {
    super.onClose();
    // Obsidian closes the modal before it reports the chosen suggestion.
    window.setTimeout(() => this.resolve?.(this.chosen), 0);
  }
}

const basename = (path: string) => path.split('/').pop() ?? path;
