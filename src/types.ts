/** Stable event identity is source ID + UID + original recurrence ID. */
export interface CalendarEvent {
  id: string;
  sourceId: string;
  uid: string;
  recurrenceId?: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  sequence?: number;
  status?: 'active' | 'cancelled' | 'removed';
  location?: string;
  description?: string;
}

export interface CalendarSource {
  id: string;
  name: string;
  url: string;
  color: string;
  enabled: boolean;
}

export interface Interval {
  start: string;
  end: string;
  allDay?: boolean;
}

export type WeekMode = 'calendar' | 'iso';
export type WeekStart = 'locale' | 'sunday' | 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday';
export type NoteProvider = 'calendar-note' | 'daily-notes' | 'periodic-notes' | 'calendar';
export type EventPropertiesDefault = 'obsidian' | 'collapsed' | 'expanded';
/** What clicking an event in the main calendar does. */
export type EventClickAction = 'dialog' | 'split' | 'tab';

export interface WeekRules {
  locale: string;
  weekMode: WeekMode;
  weekStart: WeekStart;
}

export interface PluginSettings extends WeekRules {
  sources: CalendarSource[];
  eventPattern: string;
  /** Move an Event Note to its pattern path when the event's date changes. */
  moveEventNotes: boolean;
  eventPropertiesDefault: EventPropertiesDefault;
  eventClickAction: EventClickAction;
  dailyFolder: string;
  dailyFormat: string;
  dailyTemplate: string;
  weeklyFolder: string;
  weeklyFormat: string;
  weeklyTemplate: string;
  timeZone: string;
  snapMinutes: number;
  defaultDurationMinutes: number;
  syncIntervalMinutes: number;
  customDays: number;
  sidebarWidth: number;
  sidebarCollapsed: boolean;
  mainCollapsed: boolean;
  workdaysOnly: boolean;
}

export interface ResolvedNoteSettings {
  folder: string;
  format: string;
  template: string;
  provider: NoteProvider;
}

export interface CalendarWeek {
  number: number;
  year: number;
  label: string;
  start: string;
  end: string;
  key: string;
}
