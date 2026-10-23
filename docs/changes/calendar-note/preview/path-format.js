(function(root) {
  'use strict';
  var momentLib = typeof module === 'object' && module.exports ? require('./vendor/moment-with-locales.min.js') : root.moment;
  function cleanSegment(value) {
    var text = String(value == null ? '' : value).normalize('NFC').replace(/[<>:"/\\|?*#^\[\]\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/g, '');
    if (!text || /^\.+$/.test(text)) text = 'Untitled event';
    if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(text)) text = '_' + text;
    // Leave room below common 255-byte limits for .md and collision suffixes.
    var characters = Array.from(text), result = '', bytes = 0;
    for (var i = 0; i < characters.length && i < 120; i++) {
      var point = characters[i].codePointAt(0);
      if (point >= 0xd800 && point <= 0xdfff) continue;
      var length = point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
      if (bytes + length > 180) break;
      result += characters[i];
      bytes += length;
    }
    return result.replace(/[. ]+$/g, '') || 'Untitled event';
  }
  function formatPath(pattern, event, locale, options) {
    var dateOnly = Boolean(options && options.dateOnly);
    if (typeof pattern !== 'string' || !pattern.trim()) throw new Error('Enter a complete note path pattern.');
    pattern = pattern.trim().replace(/(?:\.md)+$/i, '');
    if (!pattern) throw new Error('Enter a path pattern that includes a filename.');
    if (/^[\/~]/.test(pattern) || /^\\\\/.test(pattern) || /^[a-z]:/i.test(pattern)) throw new Error('Use a relative path within your Vault. Absolute paths are not supported.');
    if (pattern.split('/').some(function(s) { return s.trim() === '..' || s.trim() === '.' || !s.trim(); })) throw new Error('Paths cannot contain empty folders or dot-segment folders (. and ..).');
    var values = {title: cleanSegment(event.title), calendar: cleanSegment(event.calendar), uid: cleanSegment(event.uid)};
    var tokens = [];
    var protectedPattern = '';
    for (var index = 0; index < pattern.length; index++) {
      var character = pattern[index];
      if (character === '\\') {
        if (pattern[index + 1] === '{') {
          var escapedClose = pattern.indexOf('}', index + 2);
          if (escapedClose === -1) throw new Error('Placeholder braces are incomplete.');
          protectedPattern += '[' + pattern.slice(index + 1, escapedClose + 1) + ']';
          index = escapedClose;
        } else protectedPattern += character + (pattern[++index] || '');
      } else if (character === '[') {
        var close = pattern.indexOf(']', index + 1);
        if (close === -1) { protectedPattern += pattern.slice(index); break; }
        protectedPattern += pattern.slice(index, close + 1);
        index = close;
      } else if (character === '{') {
        var brace = pattern.indexOf('}', index + 1);
        if (brace === -1) throw new Error('Placeholder braces are incomplete.');
        var key = pattern.slice(index + 1, brace);
        if (dateOnly) throw new Error('Daily Note paths use date tokens only. Remove {' + key + '} or put literal text in [square brackets].');
        if (!Object.prototype.hasOwnProperty.call(values, key)) throw new Error('Unsupported placeholder {' + key + '}.');
        protectedPattern += '[⟦CNPLACEHOLDER' + tokens.length + '⟧]';
        tokens.push(values[key]);
        index = brace;
      } else if (character === '}') {
        throw new Error('Placeholder braces are incomplete.');
      } else protectedPattern += character;
    }
    var date = momentLib.parseZone(event.start, momentLib.ISO_8601, true);
    if (!date.isValid()) throw new Error('Enter a valid event start time.');
    if (dateOnly) date.utcOffset(480).startOf('day');
    date.locale(locale || 'en');
    if (options && options.weekSpec) {
      // Override only this Moment instance; Calendar's week-start setting must
      // never change the global locale used by Event and Daily Notes.
      var scopedLocale = Object.create(date.localeData());
      scopedLocale._week = {dow:options.weekSpec.dow,doy:options.weekSpec.doy};
      date._locale = scopedLocale;
    }
    var formatted = date.format(protectedPattern);
    formatted = formatted.replace(/⟦CNPLACEHOLDER(\d+)⟧/g, function(_, n) { return tokens[Number(n)]; });
    if (formatted.split('/').some(function(s) { return s.trim() === '..' || s.trim() === '.' || !s.trim(); })) throw new Error('The pattern produced an invalid folder.');
    var parts = formatted.split('/').map(cleanSegment);
    parts[parts.length-1] = parts[parts.length-1].replace(/(?:\.md)+$/i, '') || 'Untitled event';
    parts[parts.length-1] += '.md';
    return parts.join('/');
  }
  var api = { cleanSegment:cleanSegment, formatPath:formatPath };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CalendarPath = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
