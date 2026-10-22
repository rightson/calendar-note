(function () {
  'use strict';
  var $ = function (s, context) { return (context || document).querySelector(s); };
  var $$ = function (s, context) { return Array.from((context || document).querySelectorAll(s)); };
  var esc = function (value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); };
  var defaults = {pattern:'[Calendar Notes]/{title}', locale:'zh-tw', density:'comfortable', interval:'15', sources:[
    {id:'work', name:'工作', color:'#8270b4', url:'https://calendar.example.com/work.ics', enabled:true},
    {id:'personal', name:'個人', color:'#81967d', url:'webcal://calendar.example.com/personal.ics', enabled:true},
    {id:'team', name:'團隊', color:'#7098b7', url:'https://calendar.example.com/team.ics', enabled:true}
  ]};
  var storageAvailable = true;
  function read(key, fallback) { try { var value = localStorage.getItem(key); return value ? JSON.parse(value) : fallback; } catch (_) { storageAvailable = false; return fallback; } }
  function persist(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (_) { storageAvailable = false; return false; } }
  var saved = read('calendar-note-settings-v1', null);
  var settings = JSON.parse(JSON.stringify(defaults));
  if (saved && typeof saved === 'object') {
    if (typeof saved.pattern === 'string') { try { CalendarPath.formatPath(saved.pattern, {title:'行程',calendar:'工作',uid:'test',start:'2026-10-23T10:00:00+08:00'}, saved.locale); settings.pattern = saved.pattern; } catch (_) {} }
    if (['zh-tw','en'].includes(saved.locale)) settings.locale = saved.locale;
    if (['comfortable','compact'].includes(saved.density)) settings.density = saved.density;
    if (['5','15','30','60'].includes(saved.interval)) settings.interval = saved.interval;
    if (Array.isArray(saved.sources)) settings.sources = saved.sources.filter(function(s) { return s && typeof s.id === 'string' && typeof s.name === 'string' && typeof s.url === 'string' && /^#[0-9a-f]{6}$/i.test(s.color); }).map(function(s) { return {id:s.id,name:s.name.slice(0,40),url:s.url,color:s.color,enabled:s.enabled !== false}; });
  }
  var notes = read('calendar-note-notes-v1', {});
  if (!notes || typeof notes !== 'object' || Array.isArray(notes)) notes = {};
  Object.keys(notes).forEach(function(k) { if (!notes[k] || typeof notes[k].path !== 'string' || typeof notes[k].content !== 'string') delete notes[k]; });
  var events = [
    ['work','strategy-sync','2026-10-19','09:30',60,'每週策略對焦','會議室 A · 3F'],
    ['personal','read','2026-10-19','14:00',90,'閱讀與深度思考','留一段時間給自己'],
    ['team','design','2026-10-20','10:00',90,'設計評審','Figma · 線上會議'],
    ['work','customer','2026-10-20','15:00',60,'客戶訪談 — 準備','研究工作室'],
    ['personal','coffee','2026-10-21','08:30',60,'咖啡與晨間書寫','慢慢咖啡'],
    ['work','focus','2026-10-21','11:00',120,'專注工作｜新功能規劃','請勿打擾'],
    ['team','weekly','2026-10-21','16:00',60,'團隊週會','Google Meet'],
    ['team','review','2026-10-22','09:00',90,'Sprint Review','線上會議'],
    ['work','one-on-one','2026-10-22','09:30',60,'1:1 交流','小會議室'],
    ['personal','walk','2026-10-22','15:00',60,'散步，整理想法','河濱公園'],
    ['work','roadmap','2026-10-23','10:00',90,'產品策略 / Q4: Roadmap?','會議室 B · 3F'],
    ['team','handoff','2026-10-23','14:00',60,'開發交接','線上會議'],
    ['personal','reflection','2026-10-23','17:00',60,'本週回顧與下週計畫','自己的角落'],
    ['personal','weekend','2026-10-24','10:00',120,'週末的自由時光','城市走走'],
    ['personal','rest','2026-10-25','16:00',60,'留白時間','給未安排的靈感']
  ].map(function(e) { return {source:e[0],uid:e[1],date:e[2],start:e[2]+'T'+e[3]+':00+08:00',duration:e[4],title:e[5],location:e[6]}; });
  events.push({source:'team',uid:'release',date:'2026-10-23',start:'2026-10-23T00:00:00+08:00',duration:1440,title:'v2.4 上線日',location:'產品里程碑',allDay:true});
  var state = {view:'week', date:moment.parseZone('2026-10-23T12:00:00+08:00'), selected:null};
  var toastTimer;
  function toast(message) { var el=$('#toast'); el.textContent=message; el.classList.add('visible'); clearTimeout(toastTimer); toastTimer=setTimeout(function(){el.classList.remove('visible');},3200); }
  function saveSettings(message) { var ok=persist('calendar-note-settings-v1',settings); if (message) toast(ok ? message : '瀏覽器無法儲存；本次頁面仍可使用。'); }
  function sourceOf(e) { return settings.sources.find(function(s){ return s.id===e.source; }); }
  function visibleEvents() { return events.filter(function(e){var s=sourceOf(e); return s && s.enabled;}); }
  function eventKey(e) { return e.source+'|'+e.uid+'|'+e.start; }
  function hasNote(e) { return Boolean(notes[eventKey(e)]); }
  function sourceName(e) { var s=sourceOf(e); return s ? s.name : '已移除的訂閱'; }
  function weekStart(date) { return date.clone().isoWeekday(1).startOf('day'); }
  var iconCalendar='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 2v6M17 2v6M3 11h18M7 15h3m4 0h3"/></svg>';
  var iconSettings='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 3-1 3-3 1 1 3-2 2 2 2-1 3 3 1 1 3h5l1-3 3-1-1-3 2-2-2-2 1-3-3-1-1-3z"/><circle cx="11.5" cy="12" r="3"/></svg>';
  var iconDoc='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H5v18h14V8zM14 3v6h5M8 13h8M8 17h6"/></svg>';
  function renderSidebar() {
    var page=document.body.dataset.page;
    var mini=''; var first=moment('2026-10-01').isoWeekday(1); var selectedStart=weekStart(state.date).format('YYYY-MM-DD'); var selectedEnd=weekStart(state.date).add(6,'days').format('YYYY-MM-DD');
    ['一','二','三','四','五','六','日'].forEach(function(d){mini+='<span class="mini-weekday">'+d+'</span>';});
    for(var i=0;i<35;i++){var day=first.clone().add(i,'days'), iso=day.format('YYYY-MM-DD'); mini+='<button class="mini-day '+(day.month()!==9?'outside ':'')+(iso==='2026-10-23'?'today ':'')+(iso>=selectedStart&&iso<=selectedEnd?'selected-week':'')+'" data-mini-date="'+iso+'" aria-label="前往 '+day.format('M 月 D 日')+'">'+day.date()+'</button>';}
    $('#sidebar').innerHTML='<a href="index.html" class="brand" aria-label="Calendar-Note 首頁"><svg class="brand-icon" viewBox="0 0 36 38" fill="none" aria-hidden="true"><path d="M7 7h19l5 5v21H7z" fill="#e8e0f1"/><path d="M4 5h22v26H4z" fill="#967bb7"/><path d="M4 11h22M9 2v6M21 2v6" stroke="#f8f4fc" stroke-width="1.8" stroke-linecap="round"/><path d="M9 17h5v5H9zM17 17h5M17 21h5M9 26h13" stroke="#fff" stroke-width="1.3"/><path d="m23 28 6-7 3 3-6 7-4 1z" fill="#bea7d3" stroke="#f5effa"/></svg><span>Calendar-Note</span></a><div class="workspace-label">PERSONAL VAULT</div><nav class="nav-links" aria-label="主要導覽"><a class="nav-item '+(page==='calendar'?'active':'')+'" href="index.html" aria-label="週行事曆">'+iconCalendar+'<span>週行事曆</span></a><a class="nav-item '+(page==='settings'?'active':'')+'" href="settings.html" aria-label="設定">'+iconSettings+'<span>設定</span></a><a class="nav-item" href="../proposal.html" aria-label="產品提案">'+iconDoc+'<span>產品提案</span></a></nav><div class="mini-calendar"><div class="mini-header"><span>2026 年 10 月</span><span>· · ·</span></div><div class="mini-grid">'+mini+'</div></div><div class="sidebar-section"><div class="sidebar-heading"><span>我的行事曆</span><a href="settings.html#subscriptions" aria-label="管理訂閱">＋</a></div>'+settings.sources.map(function(s){return '<label class="subscription-toggle" style="--source-color:'+s.color+'"><input type="checkbox" data-source-toggle="'+esc(s.id)+'" '+(s.enabled?'checked':'')+'><span>'+esc(s.name)+'</span><span class="source-count">'+events.filter(function(e){return e.source===s.id;}).length+'</span></label>';}).join('')+'</div><div class="sidebar-bottom"><span class="sync-dot"></span>模擬同步 · 本機示範<p>示範資料 · 無外部連線</p></div>';
    $$('[data-source-toggle]').forEach(function(input){input.addEventListener('change',function(){var s=settings.sources.find(function(x){return x.id===input.dataset.sourceToggle;});s.enabled=input.checked;saveSettings();if(page==='calendar')renderCalendar();else renderSources();});});
    $$('[data-mini-date]').forEach(function(button){button.addEventListener('click',function(){if(page==='calendar'){state.date=moment.parseZone(button.dataset.miniDate+'T12:00:00+08:00'); renderCalendar();renderSidebar();}else window.location.href='index.html?date='+button.dataset.miniDate;});});
  }
  function eventButton(e,extra) {
    var source=sourceOf(e);var start=moment.parseZone(e.start);var end=start.clone().add(e.duration,'minutes');
    return '<button class="event-card '+(extra||'')+' '+(state.selected&&eventKey(state.selected)===eventKey(e)?'selected':'')+'" data-event="'+e.uid+'" style="--event-color:'+source.color+';--top:'+((start.hour()-8)*60+start.minute())+'px;--height:'+Math.max(e.duration-5,25)+'px" aria-label="'+esc(e.title)+'，'+start.format('HH:mm')+'，開啟筆記"><span class="event-time">'+start.format('HH:mm')+' – '+end.format('HH:mm')+'</span><span class="event-title">'+esc(e.title)+'</span><span class="event-note" aria-hidden="true">'+(hasNote(e)?'▤':'↗')+'</span></button>';
  }
  function bindEvents(root) { $$('[data-event]',root).forEach(function(button){button.addEventListener('click',function(){openNote(events.find(function(e){return e.uid===button.dataset.event;}));});}); }
  function renderCalendar() {
    if(document.body.dataset.page!=='calendar')return;
    document.body.classList.toggle('density-compact',settings.density==='compact');
    var start=state.view==='week'||state.view==='list'?weekStart(state.date):state.view==='month'?state.date.clone().startOf('month'):state.date.clone().startOf('day');
    var end=start.clone().add(state.view==='month'?1:state.view==='day'?1:7,state.view==='month'?'month':'days');
    var relevant=visibleEvents().filter(function(e){return e.date>=start.format('YYYY-MM-DD')&&e.date<end.format('YYYY-MM-DD');});
    $('#month-title').textContent=state.date.format('YYYY 年 M 月');
    $('#date-range').textContent=state.view==='month'?state.date.format('YYYY / M'):state.view==='day'?start.format('M 月 D 日'):start.format('M 月 D 日')+' – '+end.clone().subtract(1,'day').format(start.month()===end.clone().subtract(1,'day').month()?'D 日':'M 月 D 日');
    $$('[data-view]').forEach(function(b){b.classList.toggle('active',b.dataset.view===state.view);b.setAttribute('aria-pressed',String(b.dataset.view===state.view));});
    var html='';
    if(state.view==='list') {
      html='<div class="list-view">';
      for(var li=0;li<7;li++){var listDay=start.clone().add(li,'days');var group=relevant.filter(function(e){return e.date===listDay.format('YYYY-MM-DD');}).sort(function(a,b){return a.start.localeCompare(b.start);});if(group.length){html+='<h3 class="list-day">'+listDay.locale('zh-tw').format('M 月 D 日 · dddd')+'</h3>'+group.map(function(e){return '<button class="list-event" data-event="'+e.uid+'"><time>'+(e.allDay?'全天':moment.parseZone(e.start).format('HH:mm')+' – '+moment.parseZone(e.start).add(e.duration,'minutes').format('HH:mm'))+'</time><span class="color-dot" style="--source-color:'+sourceOf(e).color+'"></span><strong>'+esc(e.title)+'</strong><span class="list-source">'+esc(sourceName(e))+'</span><span style="color:#b2a0bf">'+(hasNote(e)?'▤':'↗')+'</span></button>';}).join('');}}
      if(!relevant.length)html+='<div class="list-empty">這一週沒有行程。<br><small>示範資料位於 2026 年 10 月 19–25 日。</small></div>';
      html+='</div>';
    } else if(state.view==='month') {
      html='<div class="calendar-scroll"><div class="month-head">'+['一','二','三','四','五','六','日'].map(function(d){return '<span>星期'+d+'</span>';}).join('')+'</div><div class="month-grid">';
      var monthStart=weekStart(start);
      for(var m=0;m<42;m++){var d=monthStart.clone().add(m,'days'),iso=d.format('YYYY-MM-DD');html+='<div class="month-cell '+(d.month()!==state.date.month()?'outside':'')+'"><button class="month-date '+(iso==='2026-10-23'?'today':'')+'" data-day="'+iso+'" aria-label="開啟 '+d.format('M 月 D 日')+' 日檢視">'+d.date()+'</button>'+visibleEvents().filter(function(e){return e.date===iso;}).map(function(e){return '<button class="month-event" data-event="'+e.uid+'" style="--event-color:'+sourceOf(e).color+'">'+(e.allDay?'全天':moment.parseZone(e.start).format('HH:mm'))+' '+esc(e.title)+'</button>';}).join('')+'</div>';}
      html+='</div></div>';
    } else {
      var count=state.view==='day'?1:7;
      html='<div class="calendar-scroll"><div class="week-wrap" style="--days:'+count+';'+(count===1?'min-width:400px':'')+'"><div class="calendar-head"><div class="head-zone">GMT+8</div>';
      for(var h=0;h<count;h++){var hd=start.clone().add(h,'days');html+='<div class="day-heading '+(hd.format('YYYY-MM-DD')==='2026-10-23'?'is-today ':'')+(hd.isoWeekday()>5?'weekend':'')+'"><div class="day-name">星期'+['日','一','二','三','四','五','六'][hd.day()]+'</div><div class="day-number">'+hd.date()+'</div></div>';}
      html+='</div><div class="all-day-grid"><div class="all-day-label">全天</div>';
      for(var a=0;a<count;a++){var ad=start.clone().add(a,'days').format('YYYY-MM-DD');html+='<div class="all-day-cell">'+relevant.filter(function(e){return e.allDay&&e.date===ad;}).map(function(e){return '<button class="all-day-event" data-event="'+e.uid+'" style="--event-color:'+sourceOf(e).color+'">'+esc(e.title)+'</button>';}).join('')+'</div>';}
      html+='</div><div class="time-grid"><div class="time-labels">';for(var t=0;t<11;t++){html+='<span class="time-label" style="--hour:'+t+'">'+String(t+8).padStart(2,'0')+':00</span>';}html+='</div>';
      for(var c=0;c<count;c++){var cd=start.clone().add(c,'days');var isToday=cd.format('YYYY-MM-DD')==='2026-10-23';html+='<div class="day-column '+(isToday?'is-today ':'')+(cd.isoWeekday()>5?'weekend':'')+'">';var dayEvents=relevant.filter(function(e){return !e.allDay&&e.date===cd.format('YYYY-MM-DD');});html+=dayEvents.map(function(e){return eventButton(e,e.uid==='review'?'overlap-first':e.uid==='one-on-one'?'overlap-second':'');}).join('');if(isToday)html+='<div class="current-time" style="--now-top:315px"></div><span class="sample-time" style="--now-top:315px">13:15 示範時間</span>';html+='</div>';}
      html+='</div></div></div>';
      if(!relevant.length)html+='<div class="empty-week"><h3>為新的想法，留一點空間。</h3><p>這個期間沒有行程 · 示範資料在 10 月 19–25 日</p></div>';
    }
    $('#calendar').innerHTML=html;bindEvents($('#calendar'));
    $$('[data-day]').forEach(function(b){b.addEventListener('click',function(){state.date=moment.parseZone(b.dataset.day+'T12:00:00+08:00');state.view='day';renderCalendar();renderSidebar();});});
    if(!state.selected)renderAgenda();
  }
  function renderAgenda() {
    var today=visibleEvents().filter(function(e){return e.date==='2026-10-23';}).sort(function(a,b){return a.start.localeCompare(b.start);});
    $('#note-panel').innerHTML='<div class="agenda-heading"><div class="eyebrow">TODAY’S AGENDA · 示範</div><h2>10 月 23 日 <span style="color:#b5a9be;font-size:11px">星期五</span></h2><p>'+today.length+' 個行程，留下一些值得記錄的事。</p></div><div class="agenda-list">'+today.map(function(e){return '<button class="agenda-item" data-event="'+e.uid+'" style="--event-color:'+sourceOf(e).color+'"><span class="agenda-time">'+(e.allDay?'全天':moment.parseZone(e.start).format('HH:mm'))+'</span><span class="agenda-mark"></span><div><h3>'+esc(e.title)+'</h3><p>'+esc(sourceName(e))+' · '+(hasNote(e)?'已有筆記':'點擊建立筆記')+'</p></div></button>';}).join('')+'</div><div class="agenda-help"><div class="empty-icon">▤</div><h3>思考，從一個行程開始</h3><p>點選任何行程，開啟專屬筆記。<br>你的準備、討論與靈感，都在這裡。</p></div>';
    bindEvents($('#note-panel'));
  }
  function openNote(e) {
    if(!e)return;var key=eventKey(e),created=false;
    if(!notes[key]){var path;try{path=CalendarPath.formatPath(settings.pattern,{title:e.title,calendar:sourceName(e),uid:e.uid,start:e.start},settings.locale);}catch(err){toast(err.message);return;}var usedPaths=Object.values(notes).map(function(n){return n.path.normalize('NFC').toLowerCase();});var basePath=path.replace(/\.md$/i,'');var suffix=2;while(usedPaths.includes(path.normalize('NFC').toLowerCase())){path=basePath+' ('+(suffix++)+').md';}notes[key]={path:path,content:'# '+e.title+'\n\n> '+moment.parseZone(e.start).format('YYYY-MM-DD HH:mm')+' · '+sourceName(e)+'\n\n## 準備\n\n- \n\n## 討論與紀錄\n\n\n## 後續行動\n\n- [ ] '};persist('calendar-note-notes-v1',notes);created=true;}
    state.selected=e;var note=notes[key];
    $('#note-panel').innerHTML='<div class="panel-topline"><span class="panel-label">▤ '+(created?'已建立示範筆記':'已開啟示範筆記')+'</span><button id="close-note" class="icon-button" aria-label="關閉筆記">×</button></div><div class="note-content"><span class="note-source"><span class="color-dot" style="--source-color:'+sourceOf(e).color+'"></span>'+esc(sourceName(e))+'</span><h2>'+esc(e.title)+'</h2><div class="note-meta">'+moment.parseZone(e.start).locale('zh-tw').format('M 月 D 日（ddd）')+' · '+(e.allDay?'全天':moment.parseZone(e.start).format('HH:mm')+' – '+moment.parseZone(e.start).add(e.duration,'minutes').format('HH:mm'))+'</div><div class="note-path"><span>VAULT 相對路徑 · 模擬</span><code>'+esc(note.path)+'</code></div><div class="editor-label"><label for="note-editor">MARKDOWN 筆記</label><span id="note-save-state">本機自動儲存</span></div><textarea class="note-editor" id="note-editor" spellcheck="false" aria-label="Markdown 筆記內容">'+esc(note.content)+'</textarea><div class="note-actions"><button class="button primary" id="download-note">↓ 下載 .md</button><button class="button" id="event-details">行程資訊</button></div><p class="simulation-note">筆記僅保存在此瀏覽器。相同行程會開啟同一份筆記；重複行程以原始開始時間區分。</p></div>';
    $('#close-note').addEventListener('click',function(){state.selected=null;renderCalendar();renderAgenda();});
    $('#note-editor').addEventListener('input',function(){notes[key].content=this.value;var ok=persist('calendar-note-notes-v1',notes);$('#note-save-state').textContent=ok?'已儲存於此瀏覽器':'僅暫存於本頁';});
    $('#event-details').addEventListener('click',function(){showDetails(e);});
    $('#download-note').addEventListener('click',function(){var url=URL.createObjectURL(new Blob([notes[key].content],{type:'text/markdown;charset=utf-8'}));var a=document.createElement('a');a.href=url;a.download=notes[key].path.split('/').pop();a.click();setTimeout(function(){URL.revokeObjectURL(url);},500);toast('已下載 Markdown 筆記');});
    renderCalendar();if(window.matchMedia('(max-width: 1250px)').matches){requestAnimationFrame(function(){$('#note-panel').scrollIntoView({behavior:'smooth',block:'start'});$('#note-editor').focus({preventScroll:true});});}if(created)toast('已建立示範筆記 · 點擊同一行程可再次開啟');
  }
  function showDetails(e) {
    $('#detail-content').innerHTML='<div class="modal-header"><div class="eyebrow">行程資訊 · 唯讀示範</div><button class="icon-button" data-close-dialog aria-label="關閉">×</button></div><h2 class="detail-title">'+esc(e.title)+'</h2><p class="detail-row"><strong>時間</strong>'+moment.parseZone(e.start).locale('zh-tw').format('YYYY 年 M 月 D 日 dddd')+' · '+(e.allDay?'全天':moment.parseZone(e.start).format('HH:mm')+' – '+moment.parseZone(e.start).add(e.duration,'minutes').format('HH:mm'))+'</p><p class="detail-row"><strong>地點 / 備註</strong>'+esc(e.location)+'</p><p class="detail-row"><strong>來源</strong>'+esc(sourceName(e))+'</p><p class="detail-row"><strong>穩定識別</strong><code>'+esc(eventKey(e))+'</code></p><div class="detail-footer"><p class="field-help">原始 iCal 行程為唯讀；筆記連結以訂閱、UID 與原始開始時間辨識。</p></div>';
    $('#detail-dialog').showModal();$('#detail-dialog [data-close-dialog]').addEventListener('click',function(){$('#detail-dialog').close();});
  }
  function initCalendar() {
    var dateParam=new URLSearchParams(location.search).get('date');if(dateParam&&/^\d{4}-\d{2}-\d{2}$/.test(dateParam)&&moment(dateParam,'YYYY-MM-DD',true).isValid())state.date=moment.parseZone(dateParam+'T12:00:00+08:00');
    $$('[data-view]').forEach(function(b){b.addEventListener('click',function(){state.view=b.dataset.view;renderCalendar();});});
    $('#today-button').addEventListener('click',function(){state.date=moment().utcOffset(480);renderCalendar();renderSidebar();});
    function move(direction){state.date.add(direction,state.view==='month'?'month':state.view==='day'?'day':'week');renderCalendar();renderSidebar();}
    $('#prev-button').addEventListener('click',function(){move(-1);});$('#next-button').addEventListener('click',function(){move(1);});
    $('#refresh-button').addEventListener('click',function(){toast('模擬同步完成 · '+visibleEvents().length+' 個示範行程，未發送網路請求');});
    renderCalendar();
  }
  var editingSource=null;
  function renderSources() {
    if(!$('#source-list'))return;
    $('#source-list').innerHTML=settings.sources.length?settings.sources.map(function(s){return '<div class="source-card" style="--source-color:'+s.color+'"><div class="source-swatch">▦</div><div class="source-info"><h3>'+esc(s.name)+' <span class="small-tag">'+(s.enabled?'已啟用':'已暫停')+'</span></h3><p>'+esc(s.url)+'</p></div><label class="switch"><input type="checkbox" data-card-toggle="'+esc(s.id)+'" '+(s.enabled?'checked':'')+' aria-label="啟用 '+esc(s.name)+'"></label><button class="icon-button" data-edit="'+esc(s.id)+'" aria-label="編輯 '+esc(s.name)+'" title="編輯訂閱">✎</button><button class="icon-button danger" data-delete="'+esc(s.id)+'" aria-label="刪除 '+esc(s.name)+'" title="刪除訂閱">×</button></div>';}).join(''):'<div class="source-empty">還沒有訂閱。新增一個示範 iCal 來源，開始整理你的時間。</div>';
    $$('[data-card-toggle]').forEach(function(input){input.addEventListener('change',function(){settings.sources.find(function(s){return s.id===input.dataset.cardToggle;}).enabled=input.checked;saveSettings('已更新訂閱狀態');renderSources();renderSidebar();});});
    $$('[data-edit]').forEach(function(b){b.addEventListener('click',function(){openSource(b.dataset.edit);});});
    $$('[data-delete]').forEach(function(b){b.addEventListener('click',function(){var source=settings.sources.find(function(s){return s.id===b.dataset.delete;});if(window.confirm('刪除「'+source.name+'」訂閱？這不會刪除已建立的示範筆記。')){settings.sources=settings.sources.filter(function(s){return s.id!==source.id;});saveSettings('已刪除訂閱');renderSources();renderSidebar();}});});
  }
  function openSource(id) { editingSource=id||null;var s=settings.sources.find(function(s){return s.id===id;});$('#source-dialog-title').textContent=s?'編輯訂閱':'新增訂閱';$('#source-name').value=s?s.name:'';$('#source-url').value=s?s.url:'';$('#source-color').value=s?s.color:'#8270b4';$('#source-error').textContent='';$('#source-dialog').showModal(); }
  function sampleEvent() { return {title:$('#sample-title').value,calendar:$('#sample-calendar').value,uid:'roadmap-20261023',start:$('#sample-start').value+':00+08:00'}; }
  function updatePathPreview() {
    var valid=true;try { $('#path-result').textContent=CalendarPath.formatPath($('#path-pattern').value,sampleEvent(),$('#date-locale').value);$('#path-error').textContent=''; } catch(err){$('#path-result').textContent='請修正格式後再儲存';$('#path-error').textContent=err.message;valid=false;}
    $('#save-path').disabled=!valid;$('.path-result').classList.toggle('invalid',!valid);$('#clean-title').textContent='檔名清理：'+($('#sample-title').value||'（空白）')+' → '+CalendarPath.cleanSegment($('#sample-title').value);$('#save-status').textContent='';return valid;
  }
  function initSettings() {
    renderSources();$('#path-pattern').value=settings.pattern;$('#date-locale').value=settings.locale;$('#density').value=settings.density;$('#sync-interval').value=settings.interval;updatePathPreview();
    $('#add-source').addEventListener('click',function(){openSource();});
    $$('[data-close-dialog]').forEach(function(b){b.addEventListener('click',function(){b.closest('dialog').close();});});
    $('#source-form').addEventListener('submit',function(e){e.preventDefault();var url=$('#source-url').value.trim(),name=$('#source-name').value.trim();var validUrl=false;try{var parsed=new URL(url);validUrl=['https:','webcal:'].includes(parsed.protocol)&&Boolean(parsed.hostname);}catch(_){}if(!name||!validUrl){$('#source-error').textContent='請填寫名稱，以及有效的 https:// 或 webcal:// 網址。';return;}var s=settings.sources.find(function(s){return s.id===editingSource;});if(s){s.name=name;s.url=url;s.color=$('#source-color').value;}else settings.sources.push({id:'source-'+Date.now(),name:name,url:url,color:$('#source-color').value,enabled:true});saveSettings('已儲存示範訂閱 · 無外部連線');renderSources();renderSidebar();$('#source-dialog').close();});
    ['#path-pattern','#sample-title','#sample-start','#sample-calendar','#date-locale'].forEach(function(sel){$(sel).addEventListener('input',updatePathPreview);});
    $$('[data-pattern]').forEach(function(b){b.addEventListener('click',function(){$('#path-pattern').value=b.dataset.pattern;updatePathPreview();});});
    $('#path-form').addEventListener('submit',function(e){e.preventDefault();if(!updatePathPreview())return;settings.pattern=$('#path-pattern').value.trim();settings.locale=$('#date-locale').value;saveSettings('已儲存路徑設定');$('#save-status').textContent=storageAvailable?'✓ 已儲存':'僅暫存於本頁';});
    $('#reset-path').addEventListener('click',function(){$('#path-pattern').value=defaults.pattern;$('#date-locale').value=defaults.locale;updatePathPreview();toast('已套用預設值；儲存後生效');});
    $('#density').addEventListener('change',function(){settings.density=this.value;saveSettings('已儲存卡片密度');});
    $('#sync-interval').addEventListener('change',function(){settings.interval=this.value;saveSettings('已儲存同步偏好 · 原型不會自動連線');});
    $$('.settings-nav a').forEach(function(a){a.addEventListener('click',function(){$$('.settings-nav a').forEach(function(x){x.classList.toggle('active',x===a);});});});
  }
  renderSidebar();if(document.body.dataset.page==='calendar')initCalendar();else initSettings();
  $$('dialog').forEach(function(dialog){dialog.addEventListener('click',function(e){if(e.target===dialog){var rect=dialog.getBoundingClientRect();if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom)dialog.close();}});});
  document.addEventListener('keydown',function(e){if(e.key==='Escape'&&state.selected&&!document.querySelector('dialog[open]')){state.selected=null;renderCalendar();}});
  if(!storageAvailable)toast('本機儲存不可用；本次頁面仍可操作。');
})();
