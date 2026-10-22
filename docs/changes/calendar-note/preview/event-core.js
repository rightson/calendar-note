(function(root) {
  'use strict';
  var node = typeof module === 'object' && module.exports;
  var momentLib = node ? require('./vendor/moment-with-locales.min.js') : root.moment;
  var pathLib = node ? require('./path-format.js') : root.CalendarPath;
  function date(value) {
    var result = momentLib.parseZone(value, momentLib.ISO_8601, true);
    if (!result.isValid()) throw new Error('Enter a valid date and time.');
    return result.utcOffset(480);
  }
  function iso(value) { return date(value).format('YYYY-MM-DDTHH:mm:ssZ'); }
  function stableKey(event) {
    return event.source === 'local' ? 'local|' + event.uid : event.source + '|' + event.uid + '|' + (event.originalStart || event.start);
  }
  function validateInterval(start, end) {
    var from = date(start), to = date(end);
    if (to.diff(from, 'minutes', true) < 15) throw new Error('The event must end at least 15 minutes after it starts.');
    if (to.isAfter(from.clone().startOf('day').add(1, 'day'))) throw new Error('This prototype supports single-day events ending no later than midnight.');
    return {start:iso(from), end:iso(to)};
  }
  function resizeInterval(event, edge, deltaMinutes) {
    var from = date(event.start), to = date(event.end);
    var change = Math.round(deltaMinutes / 15) * 15;
    if (edge === 'start') from.add(change, 'minutes');
    else if (edge === 'end') to.add(change, 'minutes');
    else throw new Error('Unknown time adjustment direction.');
    // The opposite edge is fixed. Resizing stays inside the event's calendar day.
    var day = date(event.start).startOf('day');
    if (from.isBefore(day) || !from.isBefore(day.clone().add(1,'day')) || to.isAfter(day.clone().add(1,'day'))) throw new Error('Keep dragging within the same day. Use “Adjust time” to move to another date.');
    return validateInterval(from, to);
  }
  function splitFrontmatter(content) {
    var match = /^(?:\uFEFF)?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content);
    return match ? {yaml:match[1],body:content.slice(match[0].length),has:true,newline:match[0].includes('\r\n')?'\r\n':'\n'} : {yaml:'',body:content,has:false,newline:'\n'};
  }
  function updateFrontmatter(content, event) {
    var parsed=splitFrontmatter(content), lines=parsed.yaml?parsed.yaml.split(/\r?\n/):[];
    var fields = {event_id:stableKey(event),start:iso(event.start),end:iso(event.end)};
    if(event.source !== 'local') fields.source=event.source;
    Object.keys(fields).forEach(function(key){
      var expression=new RegExp('^'+key+':(?:\\s|$)');
      var first=lines.findIndex(function(line){return expression.test(line);});
      var replacement=key+': '+JSON.stringify(fields[key]);
      if(first<0)lines.push(replacement);
      else {lines[first]=replacement;lines=lines.filter(function(line,index){return index===first||!expression.test(line);});}
    });
    return '---'+parsed.newline+lines.join(parsed.newline)+parsed.newline+'---'+parsed.newline+parsed.body;
  }
  function safeAlias(title) { return String(title).replace(/[\[\]|#\r\n]/g,' ').replace(/\s+/g,' ').trim() || 'Untitled event'; }
  function dailyPath(pattern, event, locale) { return pathLib.formatPath(pattern,{title:event.title,calendar:event.calendar||'Local events',uid:event.uid,start:event.start},locale); }
  function dailyBullet(event,notePath) {
    var from=date(event.start),to=date(event.end),time=event.allDay?'All day':from.format('HH:mm')+'–'+(to.date()!==from.date()?'24:00':to.format('HH:mm'));
    return '- '+time+' [['+notePath.replace(/\.md$/i,'')+'|'+safeAlias(event.title)+']]';
  }
  function markdownLines(content) {
    var lines=content.split('\n'), offset=0, fence=null, parsed=splitFrontmatter(content),bodyStart=parsed.has?content.length-parsed.body.length:0;
    return lines.map(function(line,index){
      var raw=line.replace(/\r$/,''),after=offset+line.length+(index<lines.length-1?1:0),plain=offset>=bodyStart;
      var record={text:raw,start:offset,after:after,plain:false};
      if(plain){var marker=/^ {0,3}(`{3,}|~{3,})/.exec(raw);
        if(marker){var char=marker[1][0],size=marker[1].length;if(!fence)fence={char:char,size:size};else if(char===fence.char&&size>=fence.size)fence=null;}
        else record.plain=!fence;
      }
      offset=after;return record;
    });
  }
  function headings(content) {
    return markdownLines(content).filter(function(line){return line.plain;}).map(function(line){
      var heading=/^ {0,3}(#{1,6})[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/.exec(line.text);
      return heading?{level:heading[1].length,title:heading[2],start:line.start,after:line.after}:null;
    }).filter(Boolean);
  }
  function eventSection(content) {
    var list=headings(content),section=list.find(function(h){return h.level===2&&h.title==='Event';});
    if(!section)return null;
    var next=list.find(function(h){return h.start>section.start&&h.level<=section.level;});
    return {start:section.after,end:next?next.start:content.length};
  }
  function managedLines(content) {
    var section=eventSection(content);
    return section?markdownLines(content).filter(function(line){return line.plain&&line.start>=section.start&&line.start<section.end;}):[];
  }
  function removeTrackedBullet(content, previousBullet) {
    if(!previousBullet)return content;
    // Only remove this event's generated line within Event, outside YAML and fenced code.
    var line=managedLines(content).find(function(item){return item.text===previousBullet;});
    return line?content.slice(0,line.start)+content.slice(line.after):content;
  }
  function upsertDailyEvent(content, event, notePath, previousBullet) {
    var bullet=dailyBullet(event,notePath);
    if(previousBullet===bullet&&managedLines(content).some(function(line){return line.text===bullet;}))return {content:content,bullet:bullet};
    content=removeTrackedBullet(content,previousBullet);
    if(managedLines(content).some(function(line){return line.text===bullet;}))return {content:content,bullet:bullet};
    var section=eventSection(content);
    if(!section)return {content:content+(content.endsWith('\n')?'':'\n')+'\n## Event\n\n'+bullet+'\n',bullet:bullet};
    var at=section.end,prefix=content.slice(0,at),suffix=content.slice(at);
    var addition=(prefix.endsWith('\n')?'':'\n')+bullet+'\n'+(suffix?'\n':'');
    return {content:prefix+addition+suffix,bullet:bullet};
  }
  function layoutOverlaps(items) {
    var sorted=items.map(function(item){return {id:item.id,start:item.start,end:item.end};}).sort(function(a,b){return a.start-b.start||a.end-b.end||String(a.id).localeCompare(String(b.id));});
    var result=[],group=[],columnEnds=[],groupEnd=-Infinity;
    function flush(){var count=columnEnds.length;group.forEach(function(item){item.columns=count;result.push(item);});group=[];columnEnds=[];groupEnd=-Infinity;}
    sorted.forEach(function(item){
      if(group.length&&item.start>=groupEnd)flush();
      var column=columnEnds.findIndex(function(end){return end<=item.start;});
      if(column<0)column=columnEnds.length;
      columnEnds[column]=item.end;groupEnd=Math.max(groupEnd,item.end);group.push({id:item.id,start:item.start,end:item.end,column:column});
    });flush();return result;
  }
  function isEventVisible(event,sources,localEnabled) {
    if(event.source==='local')return localEnabled!==false;
    var source=sources.find(function(s){return s.id===event.source;});
    return Boolean(source&&source.enabled&&source.url);
  }
  var api={stableKey:stableKey,validateInterval:validateInterval,resizeInterval:resizeInterval,splitFrontmatter:splitFrontmatter,updateFrontmatter:updateFrontmatter,safeAlias:safeAlias,dailyPath:dailyPath,dailyBullet:dailyBullet,headings:headings,removeTrackedBullet:removeTrackedBullet,upsertDailyEvent:upsertDailyEvent,layoutOverlaps:layoutOverlaps,isEventVisible:isEventVisible};
  if(node)module.exports=api;else root.EventCore=api;
})(typeof globalThis!=='undefined'?globalThis:this);
