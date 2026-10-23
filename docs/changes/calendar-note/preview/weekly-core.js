(function(root) {
  'use strict';
  var node = typeof module === 'object' && module.exports;
  var momentLib = node ? require('./vendor/moment-with-locales.min.js') : root.moment;
  var pathLib = node ? require('./path-format.js') : root.CalendarPath;

  function settings(options) {
    options = options || {};
    var mode = options.mode || 'calendar';
    var locale = (options.locale || 'en').toLowerCase();
    var weekStart = options.weekStart || 'locale';
    if (mode !== 'calendar' && mode !== 'iso') throw new Error('Choose Calendar or ISO week numbering.');
    if (weekStart !== 'locale' && weekStart !== 'monday' && weekStart !== 'sunday') throw new Error('Choose locale, Monday, or Sunday as the week start.');
    var localeData = momentLib.localeData(locale);
    if (!localeData || localeData._abbr !== locale) throw new Error('Choose a supported Moment locale.');
    var dow = mode === 'iso' ? 1 : weekStart === 'locale' ? localeData.firstDayOfWeek() : weekStart === 'monday' ? 1 : 0;
    var doy = mode === 'iso' ? 4 : localeData.firstDayOfYear();
    return {mode:mode,locale:locale,weekSpec:{dow:dow,doy:doy}};
  }

  function selectedDate(value) {
    var day;
    if (momentLib.isMoment(value)) day = value.clone();
    else if (typeof value !== 'string') throw new Error('Choose a valid calendar date.');
    else if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      day = momentLib.parseZone(value + 'T12:00:00+08:00', momentLib.ISO_8601, true);
      if (!day.isValid() || day.format('YYYY-MM-DD') !== value) throw new Error('Choose a valid calendar date.');
    } else day = momentLib.parseZone(value, momentLib.ISO_8601, true);
    if (!day.isValid()) throw new Error('Choose a valid calendar date.');
    return day.utcOffset(480).startOf('day');
  }

  function scopedDate(value, config) {
    var day = selectedDate(value).locale(config.locale);
    var scopedLocale = Object.create(day.localeData());
    scopedLocale._week = {dow:config.weekSpec.dow,doy:config.weekSpec.doy};
    day._locale = scopedLocale;
    return day;
  }

  function weekInfo(value, options) {
    var config = settings(options), day = scopedDate(value, config);
    var number = config.mode === 'iso' ? day.isoWeek() : day.week();
    var year = config.mode === 'iso' ? day.isoWeekYear() : day.weekYear();
    var first = day.clone().startOf(config.mode === 'iso' ? 'isoWeek' : 'week');
    var start = first.format('YYYY-MM-DD');
    return {
      number:number,
      year:year,
      label:year + '-W' + String(number).padStart(2, '0'),
      start:start,
      end:first.clone().add(6, 'days').format('YYYY-MM-DD'),
      key:config.mode + ':' + config.locale + ':' + config.weekSpec.dow + ':' + config.weekSpec.doy + ':' + start
    };
  }

  function folderPath(folder) {
    if (folder == null) folder = 'Weekly Notes';
    if (typeof folder !== 'string') throw new Error('Enter a weekly note folder.');
    if (!folder.trim()) return '';
    if (/^[\/~]/.test(folder) || /^[a-z]:/i.test(folder) || folder.indexOf('\\') !== -1) throw new Error('Use a relative weekly note folder within your Vault.');
    var parts = folder.normalize('NFC').split('/');
    if (parts.some(function(part) { return !part.trim() || part.trim() === '.' || part.trim() === '..'; })) {
      throw new Error('Weekly note folders cannot contain empty or dot segments.');
    }
    if (parts.some(function(part) {
      return /[<>:"|?*\u0000-\u001f\u007f]/.test(part) || /[. ]$/.test(part) ||
        /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(part) ||
        /\{(?:title|calendar|uid)\}/i.test(part) || new TextEncoder().encode(part).length > 255;
    })) throw new Error('Weekly note folders contain an unsupported character, reserved name, event placeholder, or overlong segment.');
    return parts.join('/');
  }

  function weeklyPath(folder, format, value, options) {
    var config = settings(options);
    var week = weekInfo(value, options);
    if (format == null || (typeof format === 'string' && !format.trim())) format = 'gggg-[W]ww';
    if (typeof format !== 'string') throw new Error('Enter a weekly note format.');
    var name = pathLib.formatPath(format, {start:week.start + 'T00:00:00+08:00'}, config.locale,
      {dateOnly:true,weekSpec:config.weekSpec});
    var parent = folderPath(folder);
    return parent ? parent + '/' + name : name;
  }

  function pathKey(path) { return path.normalize('NFC').toLowerCase(); }
  function matchingEntry(notes, key) {
    if (!notes || typeof notes !== 'object') return null;
    return Object.keys(notes).map(function(storageKey) { return {storageKey:storageKey,note:notes[storageKey]}; })
      .find(function(entry) { return entry.note && typeof entry.note.path === 'string' && pathKey(entry.note.path) === key; }) || null;
  }

  function ensureWeeklyNote(weeklyNotes, eventNotes, dailyNotes, folder, format, value, options) {
    if (!weeklyNotes || typeof weeklyNotes !== 'object') throw new Error('Weekly note storage is unavailable.');
    var week = weekInfo(value, options);
    var path = weeklyPath(folder, format, value, options);
    var key = pathKey(path);
    if (matchingEntry(eventNotes, key)) throw new Error('The Weekly Note path matches an existing Event Note. Update the path settings; existing content is preserved.');
    if (matchingEntry(dailyNotes, key)) throw new Error('The Weekly Note path matches an existing Daily Note. Update the path settings; existing content is preserved.');
    var found = matchingEntry(weeklyNotes, key);
    if (weeklyNotes[key] && (!found || weeklyNotes[key] !== found.note)) throw new Error('The Weekly Note storage key is already occupied. Existing content is preserved.');
    if (found) {
      if (found.storageKey !== key) {
        weeklyNotes[key] = found.note;
        delete weeklyNotes[found.storageKey];
      }
      return {key:key,note:found.note,created:false,week:week};
    }
    var note = {path:path,content:'# Week ' + week.number + '\n\n' + week.start + ' – ' + week.end + '\n\n## Weekly review\n\n'};
    weeklyNotes[key] = note;
    return {key:key,note:note,created:true,week:week};
  }

  var api = {weekInfo:weekInfo,weeklyPath:weeklyPath,ensureWeeklyNote:ensureWeeklyNote};
  if (node) module.exports = api;
  else root.WeeklyCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
