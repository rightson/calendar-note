(function(root) {
  'use strict';
  var node=typeof module==='object'&&module.exports;
  var EventCore=node?require('./event-core.js'):root.EventCore;
  var momentLib=node?require('./vendor/moment-with-locales.min.js'):root.moment;

  function canonical(value) {
    var parsed=momentLib.parseZone(value,momentLib.ISO_8601,true);
    if(!parsed.isValid())throw new Error('Source event has an invalid date and time.');
    return parsed.utcOffset(480).format('YYYY-MM-DDTHH:mm:ssZ');
  }
  function times(event) {
    if(!event)return null;
    var start=canonical(event.start),end=canonical(event.end);
    if(momentLib.parseZone(end).valueOf()<=momentLib.parseZone(start).valueOf())throw new Error('Source event must end after it starts.');
    return {start:start,end:end,allDay:event.allDay===true};
  }
  function sameTimes(left,right) {
    return Boolean(left&&right&&left.start===right.start&&left.end===right.end&&left.allDay===right.allDay);
  }
  function effective(source,override) {
    if(!source)return null;
    if(!override)return times(source);
    return times({start:override.start,end:override.end,allDay:override.allDay===true});
  }
  function sequence(event) {
    if(!event)return null;
    var value=event.sequence;
    return Number.isSafeInteger(value)&&value>=0?value:null;
  }
  function snapshotSignature(event) {
    if(!event)return null;
    var normalized={};
    Object.keys(event).sort().forEach(function(key){
      normalized[key]=key==='start'||key==='end'?canonical(event[key]):event[key];
    });
    return JSON.stringify(normalized);
  }
  function planIncoming(previous,incoming,override) {
    if(!incoming||incoming.source==='local'||typeof incoming.source!=='string'||typeof incoming.uid!=='string'||!incoming.uid)throw new Error('Expected an imported source event with a UID.');
    var key=EventCore.stableKey(incoming);
    if(previous&&EventCore.stableKey(previous)!==key)throw new Error('Source identities do not match.');
    var sourceBefore=times(previous),sourceAfter=times(incoming);
    var effectiveBefore=effective(previous,override),effectiveAfter=effective(incoming,override);
    var oldSequence=sequence(previous),newSequence=sequence(incoming);
    var changed=previous&&!sameTimes(sourceBefore,sourceAfter);
    var stale=Boolean(previous&&oldSequence!==null&&newSequence!==null&&newSequence<oldSequence);
    var acceptSnapshot=!stale&&(!previous||snapshotSignature(previous)!==snapshotSignature(incoming));
    return {kind:!previous?'baseline':stale?'stale':changed?'changed':'unchanged',acceptSnapshot:acceptSnapshot,eventKey:key,title:typeof incoming.title==='string'?incoming.title:'',sourceBefore:sourceBefore,sourceAfter:sourceAfter,sourceSequenceBefore:oldSequence,sourceSequenceAfter:newSequence,effectiveBefore:effectiveBefore,effectiveAfter:effectiveAfter,localOverride:Boolean(override)};
  }
  function nextId(history) {
    var used=new Set(history.map(function(row){return row.id;})),index=1;
    while(used.has('change-'+String(index).padStart(6,'0')))index++;
    return 'change-'+String(index).padStart(6,'0');
  }
  function pendingMatch(history,plan,sourceRevisionBefore) {
    for(var i=history.length-1;i>=0;i--){
      var row=history[i];
      var rowRevision=Number.isSafeInteger(row.sourceRevisionBefore)&&row.sourceRevisionBefore>=0?row.sourceRevisionBefore:0;
      if(row.status==='needs_attention'&&rowRevision===sourceRevisionBefore&&row.eventKey===plan.eventKey&&sameTimes(row.sourceBefore,plan.sourceBefore)&&sameTimes(row.sourceAfter,plan.sourceAfter))return row;
    }
    return null;
  }
  function makeReviewEntry(plan,details) {
    if(!plan||plan.kind!=='changed')throw new Error('Only a changed source time creates a review entry.');
    details=details||{};
    var history=Array.isArray(details.history)?details.history:[];
    var sourceRevisionBefore=Number.isSafeInteger(details.sourceRevisionBefore)&&details.sourceRevisionBefore>=0?details.sourceRevisionBefore:0;
    var old=pendingMatch(history,plan,sourceRevisionBefore);
    var status=details.status|| (plan.localOverride?'local_override':'applied');
    if(!['applied','local_override','needs_attention'].includes(status))throw new Error('Unknown review status.');
    var at=details.detectedAt||new Date().toISOString();
    if(!Number.isFinite(Date.parse(at)))throw new Error('Review time is invalid.');
    return {id:old?old.id:nextId(history),eventKey:plan.eventKey,sourceRevisionBefore:sourceRevisionBefore,
      sourceId:String(details.sourceId||plan.eventKey.split('|')[0]),sourceName:String(details.sourceName||details.sourceId||plan.eventKey.split('|')[0]),
      title:String(details.title||plan.title||''),detectedAt:old?old.detectedAt:at,
      sourceBefore:plan.sourceBefore,sourceAfter:plan.sourceAfter,
      sourceSequenceBefore:plan.sourceSequenceBefore,sourceSequenceAfter:plan.sourceSequenceAfter,
      effectiveBefore:plan.effectiveBefore,effectiveAfter:plan.effectiveAfter,
      status:status,notePath:typeof details.notePath==='string'?details.notePath:null,
      dailyBefore:typeof details.dailyBefore==='string'?details.dailyBefore:null,
      dailyAfter:typeof details.dailyAfter==='string'?details.dailyAfter:null,
      reviewedAt:old?old.reviewedAt:null};
  }
  function upsertHistory(history,entry) {
    if(!Array.isArray(history))history=[];
    var index=history.findIndex(function(row){return row.id===entry.id;});
    if(index<0)return history.concat([entry]);
    return history.map(function(row,i){return i===index?entry:row;});
  }
  function markReviewed(history,id,at) {
    if(!Array.isArray(history))return [];
    var stamp=at||new Date().toISOString();
    if(!Number.isFinite(Date.parse(stamp)))throw new Error('Review time is invalid.');
    return history.map(function(row){return row.id===id?Object.assign({},row,{reviewedAt:row.reviewedAt||stamp}):row;});
  }
  function planUseSource(source,override) {
    if(!source||source.source==='local')throw new Error('Expected an imported source event.');
    return {eventKey:EventCore.stableKey(source),effectiveBefore:effective(source,override),effectiveAfter:times(source)};
  }
  var api={canonical:canonical,times:times,sameTimes:sameTimes,planIncoming:planIncoming,makeReviewEntry:makeReviewEntry,upsertHistory:upsertHistory,markReviewed:markReviewed,planUseSource:planUseSource};
  if(node)module.exports=api;else root.SourceSync=api;
})(typeof globalThis!=='undefined'?globalThis:this);
