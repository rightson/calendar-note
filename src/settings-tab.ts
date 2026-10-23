import { Notice, PluginSettingTab, Setting, type App } from 'obsidian';
import moment from 'moment-timezone';
import type CalendarNotePlugin from './main';
import type { CalendarSource, PluginSettings } from './types';
import { resolveDailySettings, resolveWeeklySettings } from './settings';
import { dailyNotePath, eventNotePath, weeklyNotePath, folderPath } from './paths';

const sample = { id: 'local|sample', sourceId: 'local', uid: 'sample', title: 'Sample event', start: '2026-10-23T09:00:00+08:00', end: '2026-10-23T10:00:00+08:00', allDay: false };

export function validatePluginSettings(app: App, settings: PluginSettings): { event: string; daily: string; weekly: string } {
  if (!moment.tz.zone(settings.timeZone)) throw new Error('Enter a valid IANA time zone.');
  if (![5, 10, 15, 20, 30, 60].includes(settings.snapMinutes)) throw new Error('Choose a valid snap interval.');
  if (!Number.isInteger(settings.defaultDurationMinutes) || settings.defaultDurationMinutes < 15 || settings.defaultDurationMinutes > 1440) throw new Error('Default duration must be 15–1440 minutes.');
  if (!Number.isInteger(settings.syncIntervalMinutes) || settings.syncIntervalMinutes < 1 || settings.syncIntervalMinutes > 1440) throw new Error('Sync interval must be 1–1440 minutes.');
  if (!Number.isInteger(settings.customDays) || settings.customDays < 2 || settings.customDays > 14) throw new Error('Custom days must be 2–14.');
  folderPath(settings.dailyFolder); folderPath(settings.weeklyFolder);
  const event = eventNotePath(sample, 'Local', settings);
  const daily = dailyNotePath('2026-10-23', app, settings);
  const weekly = weeklyNotePath('2026-10-23', app, settings);
  const normalized = [event, daily, weekly].map(path => path.normalize('NFC').toLocaleLowerCase('en-US'));
  if (new Set(normalized).size !== 3) throw new Error('Event, Daily, and Weekly Note paths collide for the sample date.');
  const seen = new Set<string>();
  for (const source of settings.sources) {
    if (!source.name.trim()) throw new Error('Every subscription needs a name.');
    if (!source.url.trim()) continue;
    let parsed: URL;
    try { parsed = new URL(source.url.trim()); } catch { throw new Error('Enter a valid HTTPS or webcal subscription URL.'); }
    if (!['https:', 'webcal:'].includes(parsed.protocol)) throw new Error('Use an HTTPS or webcal subscription URL.');
    if (seen.has(source.id)) throw new Error('Duplicate subscription identity.');
    seen.add(source.id);
  }
  return { event, daily, weekly };
}

export class CalendarNoteSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: CalendarNotePlugin) { super(app, plugin); }
  display(): void {
    const root = this.containerEl;
    root.empty();
    const settings = this.plugin.store.state.settings;
    root.createEl('h2', { text: 'Calendar-Note settings' });
    root.createEl('p', { text: 'Local events work without a calendar subscription.' });
    root.createEl('h3', { text: 'Note paths' });
    this.text(root, 'Event Note pattern', 'Moment date tokens, {title}, {calendar}, and {uid}.', 'eventPattern');
    root.createEl('p', { text: 'Sample: ' + eventNotePath(sample, 'Local', settings), cls: 'setting-item-description' });
    const daily = resolveDailySettings(this.app, settings);
    root.createEl('p', { text: `Daily Notes provider: ${daily.provider}`, cls: 'setting-item-description' });
    this.text(root, 'Daily fallback folder', 'Used when core Daily Notes is disabled.', 'dailyFolder');
    this.text(root, 'Daily fallback format', 'Moment date format; no event placeholders.', 'dailyFormat');
    this.text(root, 'Daily fallback template', 'Vault-relative Markdown template path, optional.', 'dailyTemplate');
    root.createEl('p', { text: 'Sample: ' + dailyNotePath('2026-10-23', this.app, settings), cls: 'setting-item-description' });
    const weekly = resolveWeeklySettings(this.app, settings);
    root.createEl('p', { text: `Weekly Notes provider: ${weekly.provider}`, cls: 'setting-item-description' });
    this.text(root, 'Weekly fallback folder', 'Used when Calendar and Periodic Notes have no active weekly settings.', 'weeklyFolder');
    this.text(root, 'Weekly fallback format', 'Moment locale week tokens: gggg and ww. ISO: GGGG and WW.', 'weeklyFormat');
    this.text(root, 'Weekly fallback template', 'Vault-relative Markdown template path, optional.', 'weeklyTemplate');
    root.createEl('p', { text: 'Sample: ' + weeklyNotePath('2026-10-23', this.app, settings), cls: 'setting-item-description' });
    root.createEl('h3', { text: 'Calendar display' });
    this.dropdown(root, 'Week numbering', 'weekMode', [['calendar', 'Calendar locale'], ['iso', 'ISO 8601']]);
    this.dropdown(root, 'Week starts on', 'weekStart', [
      ['locale', 'Locale default'], ['sunday', 'Sunday'], ['monday', 'Monday'], ['tuesday', 'Tuesday'],
      ['wednesday', 'Wednesday'], ['thursday', 'Thursday'], ['friday', 'Friday'], ['saturday', 'Saturday'],
    ]);
    this.text(root, 'Date locale', 'For example en, en-gb, or zh-tw.', 'locale');
    this.text(root, 'Display time zone', 'IANA zone, such as Asia/Taipei.', 'timeZone');
    this.dropdown(root, 'Snap interval', 'snapMinutes', [['5', '5 minutes'], ['10', '10 minutes'], ['15', '15 minutes'], ['20', '20 minutes'], ['30', '30 minutes'], ['60', '60 minutes']]);
    this.number(root, 'Default event duration (minutes)', 'defaultDurationMinutes');
    this.number(root, 'Custom view days', 'customDays');
    root.createEl('h3', { text: 'Subscriptions' });
    this.number(root, 'Refresh interval (minutes)', 'syncIntervalMinutes');
    for (const source of settings.sources) this.sourceSetting(root, source);
    new Setting(root).setName('Add subscription').setDesc('A blank URL stays inactive.').addButton(button => button.setButtonText('Add calendar').onClick(async () => {
      const next = structuredClone(this.plugin.store.state.settings);
      next.sources.push({ id: crypto.randomUUID(), name: 'New calendar', url: '', color: '#5885d8', enabled: false });
      await this.save(next);
    }));
    root.createEl('h3', { text: 'Event Note diagnostics' });
    if (!this.plugin.notes.diagnostics.length) root.createEl('p', { text: 'No invalid Event Notes found.', cls: 'setting-item-description' });
    else {
      root.createEl('p', { text: 'Fix these files in the Vault, then refresh the calendar.', cls: 'setting-item-description' });
      const list = root.createEl('ul', { cls: 'cn-diagnostics' });
      for (const diagnostic of this.plugin.notes.diagnostics) list.createEl('li', { text: diagnostic });
    }
  }

  private async save(next: PluginSettings): Promise<boolean> {
    try {
      validatePluginSettings(this.app, next);
      await this.plugin.saveSettings(next);
      this.display();
      return true;
    } catch (error) {
      new Notice(error instanceof Error ? error.message : 'Could not save settings.');
      return false;
    }
  }
  private text(root: HTMLElement, name: string, description: string, key: keyof PluginSettings): void {
    new Setting(root).setName(name).setDesc(description).addText(input => {
      input.setValue(String(this.plugin.store.state.settings[key]));
      input.inputEl.addEventListener('blur', () => {
        const value = input.getValue().trim();
        if (value === String(this.plugin.store.state.settings[key])) return;
        const next = structuredClone(this.plugin.store.state.settings);
        (next as unknown as Record<string, unknown>)[key] = value;
        void this.save(next);
      });
      input.inputEl.addEventListener('keydown', e => { if (e.key === 'Enter') input.inputEl.blur(); });
    });
  }
  private number(root: HTMLElement, name: string, key: 'defaultDurationMinutes' | 'syncIntervalMinutes' | 'customDays'): void {
    new Setting(root).setName(name).addText(input => {
      input.inputEl.type = 'number'; input.inputEl.min = '1'; input.inputEl.step = '1';
      input.setValue(String(this.plugin.store.state.settings[key]));
      input.inputEl.addEventListener('blur', () => {
        const value = Number(input.getValue());
        if (value === this.plugin.store.state.settings[key]) return;
        const next = structuredClone(this.plugin.store.state.settings);
        next[key] = value;
        void this.save(next);
      });
      input.inputEl.addEventListener('keydown', e => { if (e.key === 'Enter') input.inputEl.blur(); });
    });
  }
  private dropdown(root: HTMLElement, name: string, key: 'weekMode' | 'weekStart' | 'snapMinutes', values: [string, string][]): void {
    new Setting(root).setName(name).addDropdown(select => {
      for (const [value, label] of values) select.addOption(value, label);
      select.setValue(String(this.plugin.store.state.settings[key]));
      select.onChange(value => {
        const next = structuredClone(this.plugin.store.state.settings);
        (next as unknown as Record<string, unknown>)[key] = key === 'snapMinutes' ? Number(value) : value;
        void this.save(next);
      });
    });
  }
  private sourceSetting(root: HTMLElement, source: CalendarSource): void {
    const section = root.createDiv({ cls: 'cn-source-settings' });
    section.createEl('h4', { text: source.name });
    const update = (patch: Partial<CalendarSource>) => {
      const next = structuredClone(this.plugin.store.state.settings);
      const target = next.sources.find(item => item.id === source.id);
      if (!target) return;
      Object.assign(target, patch);
      if (!target.url.trim()) target.enabled = false;
      void this.save(next);
    };
    new Setting(section).setName('Name').addText(input => {
      input.setValue(source.name);
      input.inputEl.addEventListener('blur', () => update({ name: input.getValue().trim() }));
    });
    new Setting(section).setName('Subscription URL').setDesc('HTTPS or webcal. Stored privately in plugin data.').addText(input => {
      input.setPlaceholder('https://example.com/calendar.ics').setValue(source.url);
      input.inputEl.addEventListener('blur', () => update({ url: input.getValue().trim() }));
    });
    new Setting(section).setName('Color').addColorPicker(picker => picker.setValue(source.color).onChange(value => update({ color: value })));
    new Setting(section).setName('Enabled').addToggle(toggle => toggle.setValue(source.enabled).onChange(value => update({ enabled: value && !!source.url.trim() })));
    new Setting(section).setName('Remove subscription').setDesc('Existing Event Notes remain in the Vault.').addButton(button => button.setButtonText('Remove').onClick(() => {
      const next = structuredClone(this.plugin.store.state.settings);
      next.sources = next.sources.filter(item => item.id !== source.id);
      void this.save(next);
    }));
    const cache = this.plugin.store.state.sourceCaches[source.id];
    if (cache) section.createEl('p', { text: cache.error ? `Last refresh failed: ${cache.error}` : cache.lastSuccess ? `Last refreshed: ${cache.lastSuccess}` : 'Not refreshed yet.', cls: 'setting-item-description' });
  }
}
