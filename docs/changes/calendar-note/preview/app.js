(function () {
  'use strict';
  var $ = function(s, root) { return (root || document).querySelector(s); };
  var $$ = function(s, root) { return Array.from((root || document).querySelectorAll(s)); };
  var esc = function(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function(c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); };
  var m = function(value) { return moment.parseZone(value, moment.ISO_8601, true).utcOffset(480).locale('en'); };
  var iso = function(value) { return value.format('YYYY-MM-DDTHH:mm:ssZ'); };
  var storageAvailable = true;
  function read(key, fallback) { try { var value=localStorage.getItem(key); return value ? JSON.parse(value) : fallback; } catch (_) { storageAvailable=false; return fallback; } }
  function persist(key, value) { try { localStorage.setItem(key,JSON.stringify(value)); return true; } catch (_) { storageAvailable=false; return false; } }
  function isObject(value) { return value && typeof value==='object' && !Array.isArray(value); }
  var defaults={pattern:'[Calendar Notes]/{title}',dailyPattern:'[Daily Notes]/YYYY-MM-DD',locale:'en',density:'comfortable',interval:'15',localEnabled:true,sources:[]};
  var sampleSources=[
    {id:'work',name:'Work',color:'#8270b4',url:'https://calendar.example.com/work.ics',enabled:true,sample:true},
    {id:'personal',name:'Personal',color:'#81967d',url:'webcal://calendar.example.com/personal.ics',enabled:true,sample:true},
    {id:'team',name:'Team',color:'#7098b7',url:'https://calendar.example.com/team.ics',enabled:true,sample:true}
  ];
  var localSource={id:'local',name:'Local events',color:'#9275b8',enabled:true};
  var settings=JSON.parse(JSON.stringify(defaults));
  var saved=read('calendar-note-settings-v1',null);
  var formatSample={title:'Product strategy / Q4: Roadmap?',calendar:'Local events',uid:'sample',start:'2026-10-23T10:00:00+08:00'};
  if(isObject(saved)) {
    ['pattern','dailyPattern'].forEach(function(key){if(typeof saved[key]==='string'){try{CalendarPath.formatPath(saved[key],formatSample,saved.locale);settings[key]=saved[key];}catch(_){}}});
    if(['zh-tw','en'].includes(saved.locale))settings.locale=saved.locale;
    if(['comfortable','compact'].includes(saved.density))settings.density=saved.density;
    if(['5','15','30','60'].includes(saved.interval))settings.interval=saved.interval;
    settings.localEnabled=saved.localEnabled!==false;
    if(Array.isArray(saved.sources))settings.sources=saved.sources.filter(function(s){return isObject(s)&&typeof s.id==='string'&&s.id!=='local'&&typeof s.name==='string'&&typeof s.url==='string'&&/^#[0-9a-f]{6}$/i.test(s.color);}).map(function(s){return {id:s.id,name:s.name.slice(0,40),url:s.url,color:s.color,enabled:Boolean(s.url)&&s.enabled!==false,sample:s.sample===true||sampleSources.some(function(example){return example.id===s.id&&example.url===s.url;})};});
  }
  var notes=read('calendar-note-notes-v1',{});
  if(!isObject(notes))notes={};
  Object.keys(notes).forEach(function(key){if(!isObject(notes[key])||typeof notes[key].path!=='string'||typeof notes[key].content!=='string')delete notes[key];});
  function event(source,uid,day,time,minutes,title,location) {
    var start=m(day+'T'+time+':00+08:00');
    return {source:source,uid:uid,originalStart:iso(start),start:iso(start),end:iso(start.clone().add(minutes,'minutes')),title:title,location:location||''};
  }
  var importExamples=[
    event('work','strategy-sync','2026-10-19','09:30',60,'Weekly strategy sync','Meeting room A · 3F'),
    event('personal','read','2026-10-19','14:00',90,'Reading and deep thinking','Time for yourself'),
    event('team','design','2026-10-20','10:00',90,'Design review','Online meeting'),
    event('work','customer','2026-10-20','15:00',60,'Customer interview — preparation','Research studio'),
    event('personal','coffee','2026-10-21','08:30',60,'Coffee and morning writing','Slow Coffee'),
    event('work','focus','2026-10-21','11:00',120,'Focus time: feature planning','Do not disturb'),
    event('team','weekly','2026-10-21','16:00',60,'Weekly team meeting','Online meeting'),
    event('team','review','2026-10-22','09:00',90,'Sprint Review','Online meeting'),
    event('work','one-on-one','2026-10-22','09:30',60,'1:1 catch-up','Small meeting room'),
    event('personal','walk','2026-10-22','15:00',60,'A walk to clear your mind','Riverside park'),
    event('work','roadmap','2026-10-23','10:00',90,'Product strategy / Q4: Roadmap?','Meeting room B · 3F'),
    event('team','handoff','2026-10-23','14:00',60,'Development handoff','Online meeting'),
    event('personal','reflection','2026-10-23','17:00',60,'Weekly review and planning','A quiet corner'),
    event('personal','weekend','2026-10-24','10:00',120,'Free time for the weekend','Explore the city'),
    event('personal','rest','2026-10-25','16:00',60,'Unscheduled time','Room for inspiration')
  ];
  var release=event('team','release','2026-10-23','00:00',1440,'v2.4 launch day','Product milestone');release.allDay=true;importExamples.push(release);
  var localExamples=[event('local','local-demo-yesterday','2026-10-22','11:00',60,'Yesterday project discussion','Local demo · Try yesterday’s Daily Note'),event('local','local-demo-today','2026-10-23','10:00',90,'Product strategy / Q4: Roadmap?','Local demo · No subscription needed')];
  function validEvent(e) {
    if(!isObject(e)||e.source!=='local'||typeof e.uid!=='string'||!e.uid||typeof e.title!=='string'||!e.title.trim())return false;
    try{EventCore.validateInterval(e.start,e.end);return true;}catch(_){return false;}
  }
  var loaded=read('calendar-note-events-v2',null);
  var data={localEvents:localExamples,overrides:{},dailyNotes:{},dailyLinks:{}};
  if(isObject(loaded)) {
    if(Array.isArray(loaded.localEvents))data.localEvents=loaded.localEvents.filter(validEvent).filter(function(e,i,all){return all.findIndex(function(other){return other.uid===e.uid;})===i;}).map(function(e){return {source:'local',uid:e.uid,originalStart:e.originalStart||e.start,start:iso(m(e.start)),end:iso(m(e.end)),title:e.title.slice(0,120).replace(/[\r\n]/g,' '),location:typeof e.location==='string'?e.location:''};});
    if(isObject(loaded.overrides))Object.keys(loaded.overrides).forEach(function(key){var o=loaded.overrides[key];try{if(isObject(o)){EventCore.validateInterval(o.start,o.end);data.overrides[key]={start:o.start,end:o.end,allDay:o.allDay===true};}}catch(_){}});
    if(isObject(loaded.dailyNotes))Object.keys(loaded.dailyNotes).forEach(function(key){var n=loaded.dailyNotes[key];if(isObject(n)&&typeof n.path==='string'&&typeof n.content==='string')data.dailyNotes[key]={path:n.path,content:n.content};});
    if(isObject(loaded.dailyLinks))Object.keys(loaded.dailyLinks).forEach(function(key){var link=loaded.dailyLinks[key];if(isObject(link)&&typeof link.path==='string'&&typeof link.bullet==='string')data.dailyLinks[key]={path:link.path,bullet:link.bullet};});
  }
  var state={view:'week',date:m('2026-10-23T12:00:00+08:00'),selected:null,noteTab:'event',editing:null,suppressClickUntil:0};
  var toastTimer,drag=null;
  function toast(message) { $('#toast').textContent=message;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(function(){$('#toast').classList.remove('visible');},3800); }
  function saveSettings(message) { var ok=persist('calendar-note-settings-v1',settings);if(message)toast(ok?message:'Browser storage is unavailable; you can still use this page.'); }
  function withTransaction(action) { var beforeData=JSON.stringify(data),beforeNotes=JSON.stringify(notes);try{return action();}catch(error){data=JSON.parse(beforeData);notes=JSON.parse(beforeNotes);throw error;} }
  function saveData() { var first=persist('calendar-note-events-v2',data);var second=persist('calendar-note-notes-v1',notes);return first&&second; }
  function sourceOf(e) { return e.source==='local'?localSource:settings.sources.find(function(s){return s.id===e.source;}); }
  function sourceName(e) { var s=sourceOf(e);return s?s.name:'Removed subscription'; }
  function eventKey(e) { return EventCore.stableKey(e); }
  function allEvents() {
    var imported=importExamples.filter(function(e){var s=sourceOf(e);return s&&s.sample&&s.url;}).map(function(e){var copy=Object.assign({},e),override=data.overrides[eventKey(e)];if(override){Object.assign(copy,override);copy.localOverride=true;}return copy;});
    return data.localEvents.concat(imported);
  }
  function visibleEvents() { return allEvents().filter(function(e){return EventCore.isEventVisible(e,settings.sources,settings.localEnabled);}); }
  function findEvent(key) { return allEvents().find(function(e){return eventKey(e)===key;}); }
  function hasNote(e) { return Boolean(notes[eventKey(e)]); }
  function weekStart(value) { return value.clone().isoWeekday(1).startOf('day'); }
  function dayOf(e) { return m(e.start).format('YYYY-MM-DD'); }
  function timeText(e) { return e.allDay?'All day':m(e.start).format('HH:mm')+'–'+(m(e.end).date()!==m(e.start).date()?'24:00':m(e.end).format('HH:mm')); }
  function pathKey(path) { return path.normalize('NFC').toLowerCase(); }
  var iconCalendar='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 2v6M17 2v6M3 11h18M7 15h3m4 0h3"/></svg>';
  var iconSettings='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 3-1 3-3 1 1 3-2 2 2 2-1 3 3 1 1 3h5l1-3 3-1-1-3 2-2-2-2 1-3-3-1-1-3z"/><circle cx="11.5" cy="12" r="3"/></svg>';
  var iconDoc='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H5v18h14V8zM14 3v6h5M8 13h8M8 17h6"/></svg>';
  function renderSidebar() {
    var page=document.body.dataset.page,mini='',first=state.date.clone().startOf('month').isoWeekday(1),selectedStart=weekStart(state.date).format('YYYY-MM-DD'),selectedEnd=weekStart(state.date).add(6,'days').format('YYYY-MM-DD');
    ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].forEach(function(d){mini+='<span class="mini-weekday">'+d+'</span>';});
    for(var i=0;i<42;i++){var day=first.clone().add(i,'days'),date=day.format('YYYY-MM-DD');mini+='<button class="mini-day '+(day.month()!==state.date.month()?'outside ':'')+(date==='2026-10-23'?'today ':'')+(date>=selectedStart&&date<=selectedEnd?'selected-week':'')+'" data-mini-date="'+date+'" aria-label="Go to '+day.format('MMM D')+'">'+day.date()+'</button>';}
    function sourceToggle(s,enabled) {return '<label class="subscription-toggle" style="--source-color:'+s.color+'"><input type="checkbox" data-source-toggle="'+esc(s.id)+'" '+(enabled?'checked':'')+'><span>'+esc(s.name)+'</span><span class="source-count">'+allEvents().filter(function(e){return e.source===s.id;}).length+'</span></label>';}
    $('#sidebar').innerHTML='<a href="index.html" class="brand" aria-label="Calendar-Note home"><svg class="brand-icon" viewBox="0 0 36 38" fill="none" aria-hidden="true"><path d="M7 7h19l5 5v21H7z" fill="#e8e0f1"/><path d="M4 5h22v26H4z" fill="#967bb7"/><path d="M4 11h22M9 2v6M21 2v6" stroke="#f8f4fc" stroke-width="1.8" stroke-linecap="round"/><path d="M9 17h5v5H9zM17 17h5M17 21h5M9 26h13" stroke="#fff" stroke-width="1.3"/><path d="m23 28 6-7 3 3-6 7-4 1z" fill="#bea7d3" stroke="#f5effa"/></svg><span>Calendar-Note</span></a><div class="workspace-label">PERSONAL VAULT</div><nav class="nav-links" aria-label="Main navigation"><a class="nav-item '+(page==='calendar'?'active':'')+'" href="index.html" aria-label="Weekly calendar">'+iconCalendar+'<span>Weekly calendar</span></a><a class="nav-item '+(page==='settings'?'active':'')+'" href="settings.html" aria-label="Settings">'+iconSettings+'<span>Settings</span></a><a class="nav-item" href="../proposal.html" aria-label="Product proposal">'+iconDoc+'<span>Product proposal</span></a></nav><div class="mini-calendar"><div class="mini-header"><span>'+state.date.format('MMMM YYYY')+'</span><span>· · ·</span></div><div class="mini-grid">'+mini+'</div></div><div class="sidebar-section"><div class="sidebar-heading"><span>My calendars</span><a href="settings.html#subscriptions" aria-label="Manage subscriptions">＋</a></div>'+sourceToggle(localSource,settings.localEnabled)+settings.sources.map(function(s){return sourceToggle(s,s.enabled);}).join('')+(!settings.sources.length?'<p class="no-subscriptions">No iCal subscriptions · Local features ready</p>':'')+'</div><div class="sidebar-bottom"><span class="sync-dot"></span>Local demo · Browser storage<p>No external connections · Vault unchanged</p></div>';
    $$('[data-source-toggle]').forEach(function(input){input.addEventListener('change',function(){if(input.dataset.sourceToggle==='local')settings.localEnabled=input.checked;else {var s=settings.sources.find(function(x){return x.id===input.dataset.sourceToggle;});if(!s.url&&input.checked){input.checked=false;toast('This subscription is a draft. Add a URL to enable it. Local events remain available.');return;}s.enabled=input.checked;}saveSettings();if(page==='calendar')renderCalendar();else renderSources();});});
    $$('[data-mini-date]').forEach(function(button){button.addEventListener('click',function(){if(page==='calendar'){state.date=m(button.dataset.miniDate+'T12:00:00+08:00');renderCalendar();renderSidebar();}else location.href='index.html?date='+button.dataset.miniDate;});});
  }
  function eventCard(e,layout,minHour) {
    var from=m(e.start),to=m(e.end),top=from.diff(from.clone().startOf('day'),'minutes')-minHour*60,height=to.diff(from,'minutes');
    return '<div role="button" tabindex="0" class="event-card '+(state.selected===eventKey(e)?'selected':'')+'" data-event="'+esc(eventKey(e))+'" style="--event-color:'+sourceOf(e).color+';--top:'+top+'px;--height:'+Math.max(height-3,12)+'px;left:calc('+layout.column/layout.columns*100+'% + 3px);width:calc('+100/layout.columns+'% - 6px)" aria-label="'+esc(e.title)+', '+timeText(e)+', open note"><button class="resize-handle resize-start" data-resize="start" tabindex="-1" aria-label="Adjust '+esc(e.title)+' start time" title="Drag to adjust start time"></button><span class="event-time">'+timeText(e)+'</span><span class="event-title">'+esc(e.title)+'</span><span class="event-note" aria-hidden="true">'+(e.localOverride?'◌ ':hasNote(e)?'▤':'↗')+'</span><button class="resize-handle resize-end" data-resize="end" tabindex="-1" aria-label="Adjust '+esc(e.title)+' end time" title="Drag to adjust end time"></button></div>';
  }
  function bindEventButtons(root) {
    $$('[data-event]',root).forEach(function(card){
      card.addEventListener('click',function(ev){ev.stopPropagation();if(ev.target.closest('[data-resize]')||Date.now()<state.suppressClickUntil)return;openNote(findEvent(card.dataset.event));});
      card.addEventListener('keydown',function(ev){if(ev.target!==card)return;if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();openNote(findEvent(card.dataset.event));}if(ev.key==='ContextMenu'||(ev.shiftKey&&ev.key==='F10')){ev.preventDefault();var e=findEvent(card.dataset.event),rect=card.getBoundingClientRect();showContext(m(e.start),rect.left+10,rect.top+15,card);}});
      if(!card.closest('.day-column'))card.addEventListener('contextmenu',function(ev){ev.preventDefault();var e=findEvent(card.dataset.event);showContext(m(e.start),ev.clientX,ev.clientY,card);});
    });
  }
  function renderCalendar() {
    if(document.body.dataset.page!=='calendar')return;
    var previousScroll=$('.calendar-scroll')?{top:$('.calendar-scroll').scrollTop,left:$('.calendar-scroll').scrollLeft}:null;
    document.body.classList.toggle('density-compact',settings.density==='compact');
    var start=state.view==='week'||state.view==='list'?weekStart(state.date):state.view==='month'?state.date.clone().startOf('month'):state.date.clone().startOf('day');
    var end=start.clone().add(state.view==='month'?1:state.view==='day'?1:7,state.view==='month'?'month':'days');
    var relevant=visibleEvents().filter(function(e){return dayOf(e)>=start.format('YYYY-MM-DD')&&dayOf(e)<end.format('YYYY-MM-DD');});
    $('#month-title').textContent=state.date.format('MMMM YYYY');
    $('#date-range').textContent=state.view==='month'?state.date.format('YYYY / M'):state.view==='day'?start.format('MMM D'):start.format('MMM D')+' – '+end.clone().subtract(1,'day').format(start.month()===end.clone().subtract(1,'day').month()?'D':'MMM D');
    $$('[data-view]').forEach(function(b){b.classList.toggle('active',b.dataset.view===state.view);b.setAttribute('aria-pressed',String(b.dataset.view===state.view));});
    var html='';
    if(state.view==='list') {
      html='<div class="list-view">';
      for(var li=0;li<7;li++){var listDay=start.clone().add(li,'days'),group=relevant.filter(function(e){return dayOf(e)===listDay.format('YYYY-MM-DD');}).sort(function(a,b){return a.start.localeCompare(b.start);});if(group.length)html+='<h3 class="list-day">'+listDay.locale('en').format('MMMM D · dddd')+'</h3>'+group.map(function(e){return '<button class="list-event" data-event="'+esc(eventKey(e))+'"><time>'+timeText(e)+'</time><span class="color-dot" style="--source-color:'+sourceOf(e).color+'"></span><strong>'+esc(e.title)+'</strong><span class="list-source">'+esc(sourceName(e))+(e.localOverride?' · Local changes':'')+'</span><span style="color:#927ca3">'+(hasNote(e)?'▤':'↗')+'</span></button>';}).join('');}
      if(!relevant.length)html+='<div class="list-empty">No events this week yet.<br><small>Use “New event” to give your time a starting point.</small></div>';
      html+='</div>';
    } else if(state.view==='month') {
      html='<div class="calendar-scroll"><div class="month-head">'+['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(function(d){return '<span>'+d+'</span>';}).join('')+'</div><div class="month-grid">';
      var monthStart=weekStart(start);
      for(var mi=0;mi<42;mi++){var d=monthStart.clone().add(mi,'days'),day=d.format('YYYY-MM-DD');html+='<div class="month-cell '+(d.month()!==state.date.month()?'outside':'')+'"><button class="month-date '+(day==='2026-10-23'?'today':'')+'" data-day="'+day+'" aria-label="Open '+d.format('MMM D')+' day view">'+d.date()+'</button>'+visibleEvents().filter(function(e){return dayOf(e)===day;}).map(function(e){return '<button class="month-event" data-event="'+esc(eventKey(e))+'" style="--event-color:'+sourceOf(e).color+'">'+(e.allDay?'All day':m(e.start).format('HH:mm'))+' '+esc(e.title)+'</button>';}).join('')+'</div>';}
      html+='</div></div>';
    } else {
      var count=state.view==='day'?1:7,minHour=8,maxHour=19;
      relevant.filter(function(e){return !e.allDay;}).forEach(function(e){minHour=Math.min(minHour,m(e.start).hour());var ending=m(e.end).diff(m(e.start).startOf('day'),'minutes')/60;maxHour=Math.max(maxHour,Math.ceil(ending));});
      maxHour=Math.min(24,maxHour);var gridHeight=(maxHour-minHour)*60;
      html='<div class="calendar-scroll"><div class="week-wrap" style="--days:'+count+';'+(count===1?'min-width:400px;':'')+'--grid-height:'+gridHeight+'px"><div class="calendar-head"><div class="head-zone">GMT+8</div>';
      for(var h=0;h<count;h++){var hd=start.clone().add(h,'days');html+='<div class="day-heading '+(hd.format('YYYY-MM-DD')==='2026-10-23'?'is-today ':'')+(hd.isoWeekday()>5?'weekend':'')+'"><div class="day-name">'+['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][hd.day()]+'</div><div class="day-number">'+hd.date()+'</div></div>';}
      html+='</div><div class="all-day-grid"><div class="all-day-label">All day</div>';
      for(var a=0;a<count;a++){var ad=start.clone().add(a,'days').format('YYYY-MM-DD');html+='<div class="all-day-cell">'+relevant.filter(function(e){return e.allDay&&dayOf(e)===ad;}).map(function(e){return '<button class="all-day-event" data-event="'+esc(eventKey(e))+'" style="--event-color:'+sourceOf(e).color+'">'+esc(e.title)+'</button>';}).join('')+'</div>';}
      html+='</div><div class="time-grid"><div class="time-labels">';for(var t=minHour;t<maxHour;t++)html+='<span class="time-label" style="--hour:'+(t-minHour)+'">'+String(t).padStart(2,'0')+':00</span>';html+='</div>';
      for(var c=0;c<count;c++){var cd=start.clone().add(c,'days'),today=cd.format('YYYY-MM-DD')==='2026-10-23',dayEvents=relevant.filter(function(e){return !e.allDay&&dayOf(e)===cd.format('YYYY-MM-DD');});
        html+='<div class="day-column '+(today?'is-today ':'')+(cd.isoWeekday()>5?'weekend':'')+'" data-grid-day="'+cd.format('YYYY-MM-DD')+'" data-min-hour="'+minHour+'" data-max-hour="'+maxHour+'" aria-label="'+cd.format('MMM D')+' time grid">';
        var layouts=EventCore.layoutOverlaps(dayEvents.map(function(e){return {id:eventKey(e),start:m(e.start).valueOf(),end:m(e.end).valueOf()};}));
        html+=dayEvents.map(function(e){return eventCard(e,layouts.find(function(l){return l.id===eventKey(e);}),minHour);}).join('');
        if(today&&minHour<=13&&maxHour>13)html+='<div class="current-time" style="--now-top:'+((13-minHour)*60+15)+'px"></div><span class="sample-time" style="--now-top:'+((13-minHour)*60+15)+'px">13:15 demo time</span>';
        html+='</div>';
      }
      html+='</div></div></div>';
      if(!relevant.length)html+='<div class="empty-week"><h3>Make room for new ideas.</h3><p>Click an empty time slot to create a local event. No iCal required.</p></div>';
    }
    $('#calendar').innerHTML=html;bindEventButtons($('#calendar'));bindTimeGrid();
    $$('[data-day]').forEach(function(b){b.addEventListener('click',function(){state.date=m(b.dataset.day+'T12:00:00+08:00');state.view='day';renderCalendar();renderSidebar();});});
    if(previousScroll&&$('.calendar-scroll')){$('.calendar-scroll').scrollTop=previousScroll.top;$('.calendar-scroll').scrollLeft=previousScroll.left;}
    if(!state.selected)renderAgenda();
  }
  function renderAgenda() {
    var agendaDay=state.date.clone().startOf('day'),items=visibleEvents().filter(function(e){return dayOf(e)===agendaDay.format('YYYY-MM-DD');}).sort(function(a,b){return a.start.localeCompare(b.start);});
    $('#note-panel').innerHTML='<div class="agenda-heading"><div class="eyebrow">YOUR DAY · LOCAL DEMO</div><h2>'+agendaDay.format('MMM D')+' <span style="color:#9685a2;font-size:11px">'+agendaDay.locale('en').format('dddd')+'</span></h2><p>'+items.length+' events, each with a place for notes.</p></div><div class="agenda-list">'+items.map(function(e){return '<button class="agenda-item" data-event="'+esc(eventKey(e))+'" style="--event-color:'+sourceOf(e).color+'"><span class="agenda-time">'+(e.allDay?'All day':m(e.start).format('HH:mm'))+'</span><span class="agenda-mark"></span><div><h3>'+esc(e.title)+'</h3><p>'+esc(sourceName(e))+' · '+(hasNote(e)?'Open note':'Create note and daily link')+'</p></div></button>';}).join('')+'</div><div class="agenda-help"><div class="empty-icon">▤</div><h3>One event, two ways in</h3><p>Event Note holds the full record.<br>Daily Note keeps a link in its Event section.<br>Try the local demo event on October 22.</p><button id="agenda-create" class="button">＋ New local event</button></div>';
    bindEventButtons($('#note-panel'));$('#agenda-create').addEventListener('click',function(){openEventDialog(null,state.date.clone().hour(10).minute(0).second(0));});
  }
  function uniqueNotePath(path) {
    var used=Object.values(notes).concat(Object.values(data.dailyNotes)).map(function(n){return pathKey(n.path);}),base=path.replace(/\.md$/i,''),suffix=2;
    while(used.includes(pathKey(path)))path=base+' ('+(suffix++)+').md';
    return path;
  }
  function ensureArtifacts(e) {
    var key=eventKey(e),existing=notes[key],sample={title:e.title,calendar:sourceName(e),uid:e.uid,start:e.start};
    var notePath=existing?existing.path:uniqueNotePath(CalendarPath.formatPath(settings.pattern,sample,settings.locale));
    var diaryPath=EventCore.dailyPath(settings.dailyPattern,sample,settings.locale),diaryKey=pathKey(diaryPath);
    if(pathKey(notePath)===diaryKey||Object.values(notes).some(function(n){return pathKey(n.path)===diaryKey;}))throw new Error('The Daily Note path matches an existing Event Note. Update the path settings; existing content is preserved.');
    if(!existing)notes[key]={path:notePath,content:'# '+e.title+'\n\n## Preparation\n\n- \n\n## Discussion and notes\n\n\n## Follow-up\n\n- [ ] '};
    notes[key].content=EventCore.updateFrontmatter(notes[key].content,e);
    var previous=data.dailyLinks[key];
    if(previous&&pathKey(previous.path)!==diaryKey){var old=data.dailyNotes[pathKey(previous.path)];if(old)old.content=EventCore.removeTrackedBullet(old.content,previous.bullet);}
    if(!data.dailyNotes[diaryKey])data.dailyNotes[diaryKey]={path:diaryPath,content:'# '+m(e.start).format('YYYY-MM-DD')+'\n\n## Event\n\n## Journal\n\nWrite down what you want to remember today.\n'};
    var diary=data.dailyNotes[diaryKey],updated=EventCore.upsertDailyEvent(diary.content,e,notePath,previous&&pathKey(previous.path)===diaryKey?previous.bullet:null);
    diary.content=updated.content;data.dailyLinks[key]={path:diary.path,bullet:updated.bullet};
    return {created:!existing,note:notes[key],daily:diary};
  }
  function renderNotePanel(e,artifacts) {
    var note=artifacts.note,diary=artifacts.daily,isDaily=state.noteTab==='daily',documentNote=isDaily?diary:note,parsed=EventCore.splitFrontmatter(note.content);
    $('#note-panel').innerHTML='<div class="panel-topline"><span class="panel-label">▤ '+(isDaily?'Daily Note · Event date':'Event Note · Local demo')+'</span><button id="close-note" class="icon-button" aria-label="Close note">×</button></div><div class="note-content"><span class="note-source"><span class="color-dot" style="--source-color:'+sourceOf(e).color+'"></span>'+esc(sourceName(e))+(e.localOverride?'<span class="override-badge">Local changes only</span>':'')+'</span><h2>'+esc(e.title)+'</h2><div class="note-meta">'+m(e.start).locale('en').format('MMM D (ddd)')+' · '+timeText(e)+'</div><div class="note-tabs" role="tablist" aria-label="Note type"><button id="tab-event" role="tab" aria-selected="'+!isDaily+'" class="'+(!isDaily?'active':'')+'">Event Note</button><button id="tab-daily" role="tab" aria-selected="'+isDaily+'" class="'+(isDaily?'active':'')+'">Daily Note <span>'+m(e.start).format('MM/DD')+'</span></button></div><div class="note-path"><span>'+(isDaily?'DAILY NOTE FOR THE EVENT DATE':'EVENT NOTE')+' · VAULT-RELATIVE PATH (SIMULATED)</span><code>'+esc(documentNote.path)+'</code></div>'+(isDaily?'<div class="daily-link-status">✓ Linked in ## Event. Reopening does not add a duplicate.</div>':'<details class="frontmatter-details"><summary>Event properties · '+parsed.yaml.split('\n').length+' lines</summary><pre>'+esc(parsed.yaml)+'</pre></details>')+'<div class="editor-label"><label for="note-editor">'+(isDaily?'DAILY NOTE · READ-ONLY PREVIEW':'MARKDOWN NOTE')+'</label><span id="note-save-state">'+(isDaily?'Existing Journal content preserved':'Saved automatically in this browser')+'</span></div><textarea class="note-editor '+(isDaily?'daily-editor':'')+'" id="note-editor" spellcheck="false" '+(isDaily?'readonly':'')+' aria-label="'+(isDaily?'Daily Note read-only preview':'Event Note Markdown content')+'">'+esc(isDaily?diary.content:parsed.body)+'</textarea><div class="note-actions"><button class="button primary" id="download-note">↓ Download '+(isDaily?'Daily':'Event')+' .md</button><button class="button" id="edit-event-time">Adjust time</button></div><button class="note-detail-link" id="event-details">View event details ↗</button><p class="simulation-note">This browser prototype stores events and notes in your browser only. It does not write to your Vault. '+(e.source==='local'?'':'Changes to subscribed events create local overrides and leave remote iCal unchanged.')+'</p></div>';
    $('#close-note').addEventListener('click',function(){state.selected=null;renderCalendar();});
    function changeTab(tab){state.noteTab=tab;renderNotePanel(e,artifacts);}
    $('#tab-event').addEventListener('click',function(){changeTab('event');});$('#tab-daily').addEventListener('click',function(){changeTab('daily');});
    $$('.note-tabs button').forEach(function(button){button.addEventListener('keydown',function(ev){if(ev.key==='ArrowLeft'||ev.key==='ArrowRight'){ev.preventDefault();var next=state.noteTab==='event'?'daily':'event';changeTab(next);$('#tab-'+next).focus();}});});
    if(!isDaily)$('#note-editor').addEventListener('input',function(){var current=EventCore.splitFrontmatter(notes[eventKey(e)].content);notes[eventKey(e)].content='---\n'+current.yaml+'\n---\n'+this.value;var ok=saveData();$('#note-save-state').textContent=ok?'Saved in this browser':'Saved for this page only';});
    $('#edit-event-time').addEventListener('click',function(){openEventDialog(e);});
    $('#event-details').addEventListener('click',function(){showDetails(e);});
    $('#download-note').addEventListener('click',function(){var current=isDaily?data.dailyNotes[pathKey(diary.path)]:notes[eventKey(e)];var url=URL.createObjectURL(new Blob([current.content],{type:'text/markdown;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=current.path.split('/').pop();a.click();setTimeout(function(){URL.revokeObjectURL(url);},500);toast('Downloaded the complete Markdown note');});
  }
  function openNote(e,options) {
    if(!e)return;options=options||{};
    try {var artifacts=withTransaction(function(){return ensureArtifacts(e);});saveData();state.selected=eventKey(e);if(options.resetTab)state.noteTab='event';renderNotePanel(e,artifacts);renderCalendar();if(options.scroll!==false&&window.matchMedia('(max-width: 1250px)').matches)requestAnimationFrame(function(){$('#note-panel').scrollIntoView({behavior:'smooth',block:'start'});$('#tab-'+state.noteTab).focus({preventScroll:true});});if(artifacts.created&&!options.quiet)toast('Created Event Note and linked it to the Daily Note for '+m(e.start).format('MMM D'));}
    catch(err){toast(err.message);}
  }
  function showDetails(e) {
    $('#detail-content').innerHTML='<div class="modal-header"><div class="eyebrow">Event details · Local demo</div><button class="icon-button" data-close-dialog aria-label="Close">×</button></div><h2 class="detail-title">'+esc(e.title)+'</h2><p class="detail-row"><strong>Time</strong>'+m(e.start).locale('en').format('dddd, MMMM D, YYYY')+' · '+timeText(e)+'</p><p class="detail-row"><strong>Location / Notes</strong>'+esc(e.location||'No notes yet')+'</p><p class="detail-row"><strong>Source</strong>'+esc(sourceName(e))+(e.localOverride?' · Local changes only':'')+'</p><div class="detail-footer"><button class="button primary" id="detail-edit">Adjust start and end times</button><p class="field-help">Changing the time updates event properties and daily links. The existing Event Note keeps its path. '+(e.source==='local'?'':'Remote iCal is read-only; changes are stored locally.')+'</p></div>';
    $('#detail-dialog').showModal();$('#detail-dialog [data-close-dialog]').addEventListener('click',function(){$('#detail-dialog').close();});$('#detail-edit').addEventListener('click',function(){$('#detail-dialog').close();openEventDialog(e);});
  }
  function pointerTime(column,clientY) {
    var rect=column.getBoundingClientRect(),minimum=Number(column.dataset.minHour)*60,maximum=Number(column.dataset.maxHour)*60;
    var minute=Math.round((minimum+(clientY-rect.top)/rect.height*(maximum-minimum))/15)*15;
    return m(column.dataset.gridDay+'T00:00:00+08:00').add(Math.max(0,Math.min(1425,minute)),'minutes');
  }
  var contextStart=null,contextReturn=null;
  function hideContext(returnFocus) { var menu=$('#event-context-menu');if(!menu)return;menu.hidden=true;if(returnFocus&&contextReturn)contextReturn.focus(); }
  function showContext(start,x,y,returnTarget) {
    contextStart=start;contextReturn=returnTarget;var menu=$('#event-context-menu');$('#context-time').textContent=start.format('MMM D · HH:mm');menu.hidden=false;menu.style.left=Math.min(x,window.innerWidth-menu.offsetWidth-12)+'px';menu.style.top=Math.min(y,window.innerHeight-menu.offsetHeight-12)+'px';$('#context-create').focus();
  }
  function openEventDialog(e,start) {
    hideContext(false);state.editing=e?eventKey(e):null;
    var from=e?m(e.start):(start||state.date.clone().hour(10).minute(0)).clone().second(0).millisecond(0),to=e?m(e.end):from.clone().add(60,'minutes');
    if(!e&&to.isAfter(from.clone().startOf('day').add(1,'day')))to=from.clone().startOf('day').add(1,'day');
    $('#event-dialog-title').textContent=e?'Adjust event time':'New local event';$('#event-title').value=e?e.title:'';$('#event-title').readOnly=Boolean(e);$('#event-start').value=from.format('YYYY-MM-DDTHH:mm');$('#event-end').value=to.format('YYYY-MM-DDTHH:mm');$('#event-error').textContent='';$('#event-submit').textContent=e?'Save time and notes':'Create event and notes';
    $('#event-source').innerHTML='<option value="'+(e?esc(e.source):'local')+'">'+(e?esc(sourceName(e)):'Local events')+'</option>';$('#event-source').disabled=Boolean(e);
    $('#event-dialog-help').textContent=(e&&e.source!=='local'?'Changes to subscribed events are stored locally and leave remote iCal unchanged. ':'No iCal required. Saving creates an Event Note and links it to the Daily Note for the event date. ')+'This prototype supports single-day events through midnight in 15-minute increments.';
    $('#event-dialog').showModal();
  }
  function commitInterval(e,range) {
    var updated=Object.assign({},e,range,{allDay:false});
    withTransaction(function(){
      if(e.source==='local'){var at=data.localEvents.findIndex(function(local){return local.uid===e.uid;});data.localEvents[at]=updated;}
      else {data.overrides[eventKey(e)]={start:range.start,end:range.end,allDay:false};updated.localOverride=true;}
      ensureArtifacts(updated);
    });
    saveData();renderCalendar();renderSidebar();if(state.selected===eventKey(e))openNote(updated,{quiet:true,scroll:false});return updated;
  }
  function bindTimeGrid() {
    $$('.day-column').forEach(function(column){
      column.addEventListener('click',function(ev){if(ev.target.closest('.event-card')||Date.now()<state.suppressClickUntil)return;openEventDialog(null,pointerTime(column,ev.clientY));});
      column.addEventListener('contextmenu',function(ev){ev.preventDefault();showContext(pointerTime(column,ev.clientY),ev.clientX,ev.clientY,ev.target.closest('.event-card'));});
    });
    $$('[data-resize]').forEach(function(handle){
      handle.addEventListener('click',function(ev){ev.stopPropagation();ev.preventDefault();});
      handle.addEventListener('pointerdown',function(ev){
        if(ev.button!==0)return;ev.preventDefault();ev.stopPropagation();hideContext(false);
        var card=handle.closest('[data-event]'),e=findEvent(card.dataset.event);drag={event:e,edge:handle.dataset.resize,y:ev.clientY,pointerId:ev.pointerId,range:null,card:card,minHour:Number(card.closest('.day-column').dataset.minHour)};
        handle.setPointerCapture(ev.pointerId);card.classList.add('resizing');document.body.classList.add('is-resizing');
      });
      handle.addEventListener('pointermove',function(ev){if(!drag||drag.pointerId!==ev.pointerId)return;ev.preventDefault();try{var range=EventCore.resizeInterval(drag.event,drag.edge,ev.clientY-drag.y);drag.range=range;var from=m(range.start),to=m(range.end);drag.card.style.setProperty('--top',(from.hour()*60+from.minute()-drag.minHour*60)+'px');drag.card.style.setProperty('--height',Math.max(to.diff(from,'minutes')-3,12)+'px');$('.event-time',drag.card).textContent=from.format('HH:mm')+'–'+(to.date()!==from.date()?'24:00':to.format('HH:mm'));}catch(_){/* Keep the most recent valid interval while crossing an invalid boundary. */}});
      handle.addEventListener('pointerup',function(ev){if(!drag||drag.pointerId!==ev.pointerId)return;ev.preventDefault();ev.stopPropagation();var completed=drag;drag=null;state.suppressClickUntil=Date.now()+500;document.body.classList.remove('is-resizing');if(handle.hasPointerCapture(ev.pointerId))handle.releasePointerCapture(ev.pointerId);if(completed.range&&(completed.range.start!==completed.event.start||completed.range.end!==completed.event.end)){try{commitInterval(completed.event,completed.range);toast('Updated event times, properties and Daily Note link');}catch(err){toast(err.message);renderCalendar();}}else renderCalendar();});
      handle.addEventListener('pointercancel',function(ev){if(!drag||drag.pointerId!==ev.pointerId)return;drag=null;state.suppressClickUntil=Date.now()+500;document.body.classList.remove('is-resizing');renderCalendar();toast('Time adjustment canceled');});
    });
  }
  function initCalendar() {
    var dateParam=new URLSearchParams(location.search).get('date');if(dateParam&&/^\d{4}-\d{2}-\d{2}$/.test(dateParam)&&moment(dateParam,'YYYY-MM-DD',true).isValid())state.date=m(dateParam+'T12:00:00+08:00');
    $$('[data-view]').forEach(function(b){b.addEventListener('click',function(){state.view=b.dataset.view;renderCalendar();});});
    $('#today-button').addEventListener('click',function(){state.date=moment().utcOffset(480).locale('en');renderCalendar();renderSidebar();});
    function move(direction){state.date.add(direction,state.view==='month'?'month':state.view==='day'?'day':'week');renderCalendar();renderSidebar();}
    $('#prev-button').addEventListener('click',function(){move(-1);});$('#next-button').addEventListener('click',function(){move(1);});
    $('#new-event').addEventListener('click',function(){openEventDialog(null,state.date.clone().hour(10).minute(0).second(0));});
    $('#refresh-button').addEventListener('click',function(){var sources=settings.sources.filter(function(s){return s.enabled&&s.url;});toast(sources.length?'Simulated sync complete · Demo data retained, no network requests sent':'No enabled iCal subscriptions. Local events and notes remain available.');});
    $('#context-create').addEventListener('click',function(){openEventDialog(null,contextStart);});
    $('#event-form').addEventListener('submit',function(ev){
      ev.preventDefault();var title=$('#event-title').value.trim(),from=$('#event-start').value,to=$('#event-end').value;
      try {
        if(!title)throw new Error('Enter an event title.');
        var range=EventCore.validateInterval(from+':00+08:00',to+':00+08:00');
        if(m(range.start).minute()%15||m(range.end).minute()%15)throw new Error('Use 15-minute increments for start and end times.');
        var e;
        if(state.editing){var original=findEvent(state.editing);if(!original)throw new Error('This event no longer exists. Select another event.');e=commitInterval(original,range);}
        else {e={source:'local',uid:'local-'+(window.crypto&&crypto.randomUUID?crypto.randomUUID():Date.now()+'-'+Math.random().toString(36).slice(2)),originalStart:range.start,start:range.start,end:range.end,title:title,location:''};withTransaction(function(){ensureArtifacts(e);data.localEvents.push(e);});settings.localEnabled=true;saveSettings();saveData();}
        state.date=m(e.start);$('#event-dialog').close();state.noteTab='event';openNote(e,{quiet:true,resetTab:true});renderSidebar();toast(state.editing?'Updated event times and daily link':'Created local event, Event Note and link in the Daily Note for its date');
      } catch(err){$('#event-error').textContent=err.message;}
    });
    renderCalendar();renderSidebar();
  }
  var editingSource=null;
  function renderSources() {
    if(!$('#source-list'))return;
    $('#source-list').innerHTML=settings.sources.length?settings.sources.map(function(s){return '<div class="source-card" style="--source-color:'+s.color+'"><div class="source-swatch">▦</div><div class="source-info"><h3>'+esc(s.name)+' <span class="small-tag">'+(!s.url?'No URL · Draft':s.enabled?(s.sample?'Demo enabled':'Demo settings enabled'):'Paused')+'</span></h3><p>'+esc(s.url||'No URL set; sync is disabled and local events remain available')+'</p></div><label class="switch"><input type="checkbox" data-card-toggle="'+esc(s.id)+'" '+(s.enabled&&s.url?'checked':'')+' aria-label="Enable '+esc(s.name)+'"></label><button class="icon-button" data-edit="'+esc(s.id)+'" aria-label="Edit '+esc(s.name)+'" title="Edit subscription">✎</button><button class="icon-button danger" data-delete="'+esc(s.id)+'" aria-label="Delete '+esc(s.name)+'" title="Delete subscription">×</button></div>';}).join(''):'<div class="source-empty"><strong>No iCal subscriptions · Local features ready</strong><p>Local events, Event Note and Daily Note are ready to use.</p></div>';
    $$('[data-card-toggle]').forEach(function(input){input.addEventListener('change',function(){var s=settings.sources.find(function(s){return s.id===input.dataset.cardToggle;});if(!s.url&&input.checked){input.checked=false;toast('Add a URL first. A subscription with no URL stays a draft.');return;}s.enabled=input.checked;saveSettings('Updated subscription status');renderSources();renderSidebar();});});
    $$('[data-edit]').forEach(function(b){b.addEventListener('click',function(){openSource(b.dataset.edit);});});
    $$('[data-delete]').forEach(function(b){b.addEventListener('click',function(){var source=settings.sources.find(function(s){return s.id===b.dataset.delete;});if(confirm('Delete “'+source.name+'” subscription? Existing demo notes are preserved and local events remain available.')){settings.sources=settings.sources.filter(function(s){return s.id!==source.id;});saveSettings('Deleted subscription; local events remain available');renderSources();renderSidebar();}});});
  }
  function openSource(id) {
    editingSource=id||null;var s=settings.sources.find(function(s){return s.id===id;});$('#source-dialog-title').textContent=s?'Edit subscription':'Add subscription (optional)';$('#source-name').value=s?s.name:'';$('#source-url').value=s?s.url:'';$('#source-color').value=s?s.color:'#8270b4';$('#source-error').textContent='';$('#source-dialog').showModal();
  }
  function sampleEvent() { return {title:$('#sample-title').value,calendar:$('#sample-calendar').value,uid:'roadmap-20261023',start:$('#sample-start').value+':00+08:00'}; }
  function updatePathPreview() {
    var valid=true;try{var sample=sampleEvent(),eventPath=CalendarPath.formatPath($('#path-pattern').value,sample,$('#date-locale').value),diaryPath=EventCore.dailyPath($('#daily-pattern').value,sample,$('#date-locale').value);$('#path-result').textContent=eventPath;$('#daily-path-result').textContent=diaryPath;if(pathKey(eventPath)===pathKey(diaryPath))throw new Error('Event Note and Daily Note must use different paths to preserve their separate content.');$('#path-error').textContent='';}
    catch(err){$('#path-error').textContent=err.message;valid=false;}
    $('#save-path').disabled=!valid;$$('.path-result').forEach(function(box){box.classList.toggle('invalid',!valid);});$('#clean-title').textContent='Filename cleanup: '+($('#sample-title').value||'(empty)')+' → '+CalendarPath.cleanSegment($('#sample-title').value);$('#save-status').textContent='';return valid;
  }
  function initSettings() {
    renderSources();$('#path-pattern').value=settings.pattern;$('#daily-pattern').value=settings.dailyPattern;$('#date-locale').value=settings.locale;$('#density').value=settings.density;$('#sync-interval').value=settings.interval;updatePathPreview();
    $('#add-source').addEventListener('click',function(){openSource();});
    $('#load-demo-sources').addEventListener('click',function(){sampleSources.forEach(function(example){var existing=settings.sources.find(function(s){return s.id===example.id;});if(existing){existing.sample=true;existing.url=example.url;existing.enabled=true;}else settings.sources.push(Object.assign({},example));});saveSettings('Loaded 3 fictional subscriptions; no network requests sent');renderSources();renderSidebar();});
    $('#source-form').addEventListener('submit',function(ev){
      ev.preventDefault();var url=$('#source-url').value.trim(),name=$('#source-name').value.trim(),validUrl=!url;
      if(url)try{var parsed=new URL(url);validUrl=['https:','webcal:'].includes(parsed.protocol)&&Boolean(parsed.hostname);}catch(_){}
      if(!name||!validUrl){$('#source-error').textContent='Enter a name. Leave the URL blank or use a valid https:// or webcal:// URL.';return;}
      var source=settings.sources.find(function(s){return s.id===editingSource;});
      if(source){source.name=name;source.url=url;source.color=$('#source-color').value;source.enabled=Boolean(url)&&source.enabled;source.sample=sampleSources.some(function(example){return example.id===source.id&&example.url===url;});}
      else settings.sources.push({id:'source-'+Date.now(),name:name,url:url,color:$('#source-color').value,enabled:Boolean(url),sample:false});
      saveSettings(url?'Saved demo subscription settings · URL will not be fetched':'Saved draft · Local features remain available');renderSources();renderSidebar();$('#source-dialog').close();
    });
    ['#path-pattern','#daily-pattern','#sample-title','#sample-start','#sample-calendar','#date-locale'].forEach(function(selector){$(selector).addEventListener('input',updatePathPreview);});
    $$('[data-pattern]').forEach(function(button){button.addEventListener('click',function(){$('#path-pattern').value=button.dataset.pattern;updatePathPreview();});});
    $$('[data-daily-pattern]').forEach(function(button){button.addEventListener('click',function(){$('#daily-pattern').value=button.dataset.dailyPattern;updatePathPreview();});});
    $('#path-form').addEventListener('submit',function(ev){ev.preventDefault();if(!updatePathPreview())return;settings.pattern=$('#path-pattern').value.trim();settings.dailyPattern=$('#daily-pattern').value.trim();settings.locale=$('#date-locale').value;saveSettings('Saved Event Note and Daily Note paths');$('#save-status').textContent=storageAvailable?'✓ Saved':'Saved for this page only';});
    $('#reset-path').addEventListener('click',function(){$('#path-pattern').value=defaults.pattern;$('#daily-pattern').value=defaults.dailyPattern;$('#date-locale').value=defaults.locale;updatePathPreview();toast('Defaults applied; save to keep them');});
    $('#density').addEventListener('change',function(){settings.density=this.value;saveSettings('Saved card density');});
    $('#sync-interval').addEventListener('change',function(){settings.interval=this.value;saveSettings('Saved sync preference · This prototype does not connect automatically');});
    $$('.settings-nav a').forEach(function(a){a.addEventListener('click',function(){$$('.settings-nav a').forEach(function(x){x.classList.toggle('active',x===a);});});});
  }
  renderSidebar();if(document.body.dataset.page==='calendar')initCalendar();else initSettings();
  $$('[data-close-dialog]').forEach(function(button){button.addEventListener('click',function(){button.closest('dialog').close();});});
  $$('dialog').forEach(function(dialog){dialog.addEventListener('click',function(ev){if(ev.target===dialog){var rect=dialog.getBoundingClientRect();if(ev.clientX<rect.left||ev.clientX>rect.right||ev.clientY<rect.top||ev.clientY>rect.bottom)dialog.close();}});});
  document.addEventListener('pointerdown',function(ev){if(!ev.target.closest('#event-context-menu'))hideContext(false);});
  document.addEventListener('keydown',function(ev){if(ev.key==='Escape'){if($('#event-context-menu')&&!$('#event-context-menu').hidden){hideContext(true);return;}if(state.selected&&!document.querySelector('dialog[open]')){state.selected=null;renderCalendar();}}});
  window.addEventListener('resize',function(){hideContext(false);});
  if(!storageAvailable)toast('Local storage is unavailable; you can still use this page.');
})();
