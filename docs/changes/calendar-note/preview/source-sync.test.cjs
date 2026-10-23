const assert=require('node:assert/strict');
const core=require('./event-core.js');
const sync=require('./source-sync.js');

const first={source:'work',uid:'meeting-42',title:'Planning',start:'2026-10-23T09:00:00+08:00',end:'2026-10-23T10:00:00+08:00'};
const second={...first,start:'2026-10-24T09:00:00+08:00',end:'2026-10-24T10:00:00+08:00'};
const third={...first,start:'2026-10-25T09:00:00+08:00',end:'2026-10-25T10:00:00+08:00'};
assert.equal(core.stableKey(first),'work|meeting-42');
assert.equal(core.stableKey(second),core.stableKey(first));
assert.equal(core.legacyImportedKey({...first,originalStart:first.start}),'work|meeting-42|2026-10-23T09:00:00+08:00');
assert.equal(core.stableKey({...first,source:'personal'}),'personal|meeting-42');
assert.notEqual(core.stableKey({...first,uid:'meeting-43'}),core.stableKey(first));
const instance={...first,uid:'series-1',recurrenceId:'2026-10-23T09:00:00+08:00'};
const moved={...instance,start:'2026-10-24T09:00:00+08:00',end:'2026-10-24T10:00:00+08:00'};
const other={...instance,recurrenceId:'2026-10-30T09:00:00+08:00'};
assert.equal(core.stableKey(instance),core.stableKey(moved));
assert.equal(core.stableKey(instance),core.stableKey({...instance,recurrenceId:'2026-10-23T01:00:00Z'}));
assert.notEqual(core.stableKey(instance),core.stableKey(other));
assert.notEqual(core.stableKey(instance),core.stableKey({...instance,recurrenceId:undefined}));
assert.notEqual(core.stableKey({...first,source:'a|b',uid:'c'}),core.stableKey({...first,source:'a',uid:'b|c'}));
assert.equal(core.stableKey({source:'local',uid:'local-1',start:first.start}),core.stableKey({source:'local',uid:'local-1',start:second.start}));

const baseline=sync.planIncoming(null,first,null);
assert.equal(baseline.kind,'baseline');
assert.equal(baseline.sourceBefore,null);
assert.throws(()=>sync.makeReviewEntry(baseline,{}));
const equivalent={...first,start:'2026-10-23T01:00:00Z',end:'2026-10-23T02:00:00Z'};
assert.equal(sync.planIncoming(first,equivalent,null).kind,'unchanged');
assert.equal(sync.planIncoming(first,first,null).kind,'unchanged');
assert.equal(sync.planIncoming(first,first,null).acceptSnapshot,false);
assert.equal(sync.planIncoming(first,equivalent,null).acceptSnapshot,false);
assert.equal(sync.planIncoming(first,{...first,title:'Updated title'},null).acceptSnapshot,true);
const plan=sync.planIncoming(first,second,null);
assert.equal(plan.kind,'changed');
assert.equal(plan.eventKey,core.stableKey(first));
assert.equal(sync.makeReviewEntry(plan,{sourceName:'Work'}).title,'Planning');
assert.equal(plan.effectiveAfter.start,second.start);
assert.throws(()=>sync.planIncoming(first,{...second,uid:'different'},null));
assert.equal(sync.planIncoming({...first,sequence:5},{...second,sequence:4},null).kind,'stale');
assert.equal(sync.planIncoming({...first,sequence:5},{...second,sequence:5},null).kind,'changed');
assert.equal(sync.planIncoming({...first,sequence:5},second,null).kind,'changed');
let sequencedCache={...first,sequence:10};
const metadataOnly=sync.planIncoming(sequencedCache,{...first,sequence:11},null);
assert.equal(metadataOnly.kind,'unchanged');
assert.equal(metadataOnly.acceptSnapshot,true);
if(metadataOnly.acceptSnapshot)sequencedCache={...first,sequence:11};
assert.equal(sync.planIncoming(sequencedCache,{...second,sequence:10},null).kind,'stale');
assert.equal(sync.planIncoming(sequencedCache,{...first,sequence:10},null).kind,'stale');
const numbered=sync.planIncoming(sequencedCache,{...second,sequence:12},null);
assert.equal(numbered.sourceSequenceBefore,11);
assert.equal(sync.makeReviewEntry(numbered,{}).sourceSequenceAfter,12);

let history=[];
function saveChange(change,status) {
  const row=sync.makeReviewEntry(change,{history,sourceId:'work',sourceName:'Work',title:'Planning',detectedAt:'2026-10-23T01:00:00Z',notePath:'Calendar Notes/Planning.md',dailyBefore:'Daily/2026-10-23.md',dailyAfter:'Daily/2026-10-24.md',status});
  history=sync.upsertHistory(history,row);
  return row;
}
const rowAB=saveChange(plan,'applied');
assert.equal(rowAB.id,'change-000001');
assert.equal(rowAB.reviewedAt,null);
assert.equal(rowAB.status,'applied');
assert.equal(rowAB.sourceAfter.start,second.start);
assert.equal(rowAB.effectiveAfter.start,second.start);
assert.equal(history.length,1);
assert.ok(!JSON.stringify(rowAB).includes('https://'));
history=sync.markReviewed(history,rowAB.id,'2026-10-23T02:00:00Z');
assert.equal(history[0].reviewedAt,'2026-10-23T02:00:00Z');
assert.equal(sync.markReviewed(history,rowAB.id,'2026-10-23T03:00:00Z')[0].reviewedAt,history[0].reviewedAt);
history=JSON.parse(JSON.stringify(history));
assert.equal(history[0].id,rowAB.id);
assert.equal(history[0].reviewedAt,'2026-10-23T02:00:00Z');
assert.equal(sync.planIncoming(second,second,null).kind,'unchanged');
const rowBC=saveChange(sync.planIncoming(second,third,null),'applied');
const rowCA=saveChange(sync.planIncoming(third,first,null),'applied');
assert.equal(history.length,3);
assert.equal(new Set(history.map(row=>row.id)).size,3);
assert.equal(rowCA.sourceAfter.start,first.start);
assert.notEqual(rowAB.id,rowBC.id);

const override={start:'2026-10-26T11:00:00+08:00',end:'2026-10-26T12:00:00+08:00'};
const overridden=sync.planIncoming(first,second,override);
assert.equal(overridden.kind,'changed');
assert.equal(overridden.sourceAfter.start,second.start);
assert.equal(overridden.effectiveBefore.start,override.start);
assert.equal(overridden.effectiveAfter.start,override.start);
const localRow=sync.makeReviewEntry(overridden,{history,sourceName:'Work',title:'Planning'});
assert.equal(localRow.status,'local_override');
assert.equal(sync.planUseSource(second,override).effectiveAfter.start,second.start);
assert.equal(sync.planUseSource(second,override).effectiveBefore.start,override.start);

// A failed artifact update retains the old baseline. Retrying that same revision
// replaces its pending review row, then a later transition gets a fresh row.
let cache=first;
let pendingHistory=[];
function tryApply(incoming,fail) {
  const proposed=sync.planIncoming(cache,incoming,null);
  if(proposed.kind!=='changed')return proposed.kind;
  if(fail){
    const pending=sync.makeReviewEntry(proposed,{history:pendingHistory,status:'needs_attention',sourceName:'Work',title:'Planning'});
    pendingHistory=sync.upsertHistory(pendingHistory,pending);
    return pending.id;
  }
  const applied=sync.makeReviewEntry(proposed,{history:pendingHistory,status:'applied',sourceName:'Work',title:'Planning'});
  cache=incoming;
  pendingHistory=sync.upsertHistory(pendingHistory,applied);
  return applied.id;
}
const pendingId=tryApply(second,true);
assert.equal(cache,first);
assert.equal(tryApply(second,true),pendingId);
assert.equal(pendingHistory.length,1);
assert.equal(tryApply(second,false),pendingId);
assert.equal(pendingHistory.length,1);
assert.equal(pendingHistory[0].status,'applied');
assert.equal(tryApply(second,false),'unchanged');
assert.notEqual(tryApply(first,false),pendingId);
assert.equal(pendingHistory.length,2);

// A later A -> B transition is a new event in history, even if an older A -> B
// attempt is still pending after the accepted source went A -> C -> A.
let cycleHistory=[];
const failedPlan=sync.planIncoming(first,second,null);
const failedRow=sync.makeReviewEntry(failedPlan,{history:cycleHistory,sourceRevisionBefore:0,status:'needs_attention',detectedAt:'2026-10-23T01:00:00Z'});
cycleHistory=sync.upsertHistory(cycleHistory,failedRow);
cycleHistory=sync.markReviewed(cycleHistory,failedRow.id,'2026-10-23T01:15:00Z');
const sameAttempt=sync.makeReviewEntry(failedPlan,{history:cycleHistory,sourceRevisionBefore:0,status:'needs_attention',detectedAt:'2026-10-23T02:00:00Z'});
assert.equal(sameAttempt.id,failedRow.id);
assert.equal(sameAttempt.detectedAt,failedRow.detectedAt);
assert.equal(sameAttempt.reviewedAt,'2026-10-23T01:15:00Z');
const acceptedAC=sync.makeReviewEntry(sync.planIncoming(first,third,null),{history:cycleHistory,sourceRevisionBefore:0,status:'applied'});
cycleHistory=sync.upsertHistory(cycleHistory,acceptedAC);
const acceptedCA=sync.makeReviewEntry(sync.planIncoming(third,first,null),{history:cycleHistory,sourceRevisionBefore:1,status:'applied'});
cycleHistory=sync.upsertHistory(cycleHistory,acceptedCA);
const laterAB=sync.makeReviewEntry(sync.planIncoming(first,second,null),{history:cycleHistory,sourceRevisionBefore:2,status:'needs_attention',detectedAt:'2026-10-24T01:00:00Z'});
assert.notEqual(laterAB.id,failedRow.id);
assert.equal(laterAB.sourceRevisionBefore,2);
assert.equal(laterAB.detectedAt,'2026-10-24T01:00:00Z');
assert.equal(laterAB.reviewedAt,null);
cycleHistory=sync.upsertHistory(cycleHistory,laterAB);
assert.equal(cycleHistory.length,4);

const edited='## Event\n\n- User changed this line\n';
assert.equal(core.hasTrackedBullet(edited,'- Old generated line'),false);
assert.equal(core.hasTrackedBullet('## Event\n\n- Old generated line\n','- Old generated line'),true);
console.log('Source sync checks passed: stable identities, baseline and semantic revisions, history, overrides, rollback retry, and edited bullet detection.');
