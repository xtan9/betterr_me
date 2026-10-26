import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

// One actual Auth/HTTP setup for current history, continuing cookie Web and MCP.
// Every identity is disposable; the caller owns exact cleanup and gate restoration.
export async function verifyTrainHistory({a,b,rootA,request,mcp,parsedTool,artifactDirectory}) {
  const check=(value,message)=>{if(!value)throw new Error(message);};
  const fixture=JSON.parse(readFileSync(new URL('../../tests/fixtures/train-history-contract.json',import.meta.url),'utf8'));
  const completion={...fixture.completion,id:randomUUID(),ownerId:a.id,sourceId:randomUUID(),exercises:fixture.completion.exercises.map(entry=>({...entry,id:randomUUID(),sets:entry.sets.map(set=>({...set,id:randomUUID()}))}))};
  const upload={protocolVersion:1,operationId:completion.id,completion};
  const original=await request('/api/mobile/train/completions',a,upload);
  check(isDeepStrictEqual(await request('/api/mobile/train/completions',a,upload),original),'Create retry changed original receipt');
  const detailPath=`/api/mobile/train/history/${completion.id}`;
  const current=(await request(detailPath,a)).record;
  check(current.revision==='1'&&current.workoutDay==='2026-10-24'&&isDeepStrictEqual(current.current.document,completion),'Date-only read invented or lost facts');
  const legacy=await a.client.from('workouts').select('id').eq('id',completion.id);
  check(!legacy.error&&legacy.data.length===0,'Old timestamp reader received unrepresentable date-only row');
  const web=(await request(`/api/workouts/${completion.id}`,a,undefined,200,true)).workout;
  check(web.started_at===null&&web.duration_seconds===null&&web.workoutDay==='2026-10-24'&&web.currentHistory.revision==='1','Cookie detail fabricated time/duration');
  const assistant=parsedTool(await mcp(a,'getWorkoutDetails',{workoutId:completion.id},['read']));
  check(assistant.currentHistory.revision==='1'&&assistant.started_at===null,'Assistant did not read current authority');
  const correction={protocolVersion:1,ownerId:a.id,operationId:randomUUID(),command:{kind:'correct-workout',workoutId:completion.id,expectedRevision:'1',patch:{sets:[{entryId:completion.exercises[0].id,setId:completion.exercises[0].sets[0].id,changes:{weightKg:0.45359237,reps:6}}],time:{kind:'date-only',duration:{kind:'set',seconds:90}}}}};
  const changed=await request('/api/mobile/train/history/commands',a,correction);
  check(changed.receipt.revision==='2'&&changed.receipt.current.current.document.exercises[0].sets[0].performed.weightKg===0.45359237,'Accepted correction lost exact measurement');
  const conflictRequest={...correction,operationId:randomUUID()};
  const conflict=await request('/api/workouts/history/commands',a,conflictRequest,409,true);
  check(conflict.rejection.code==='version_conflict'&&conflict.rejection.current.revision==='2','Cookie conflict lost current revision');
  const reviewed={operationId:randomUUID(),workoutId:completion.id,expectedRevision:'2',patch:{time:{kind:'date-only',duration:{kind:'unknown'}}}};
  const denied=await mcp(a,'correctWorkoutHistory',reviewed,['read']);
  check(denied.isError===true,'Read-only MCP token mutated history');
  const accepted=parsedTool(await mcp(a,'correctWorkoutHistory',reviewed));
  check(accepted.receipt.revision==='3','Trusted MCP correction did not use current CAS');
  check(isDeepStrictEqual(await request('/api/mobile/train/history/commands',a,correction),changed),'Late successful correction retry changed first receipt');
  check((await request(detailPath,a)).record.revision==='3','Late receipt rolled current state back');
  check(isDeepStrictEqual(await request('/api/workouts/history/commands',a,conflictRequest,409,true),conflict),'Definitive rejected retry changed');
  await request(detailPath,b,undefined,404);
  await request('/api/mobile/train/history/commands',b,correction,403);
  const scope={from:null,through:null};
  const progress=await request('/api/mobile/train/history/progress',a,{protocolVersion:1,ownerId:a.id,scope,retainedIds:[completion.id]});
  check(progress.coverage.workoutCount===1&&progress.coverage.unknownDurationCount===1&&progress.coverage.knownDurationSeconds==='0','Unknown duration fabricated an aggregate');
  const deletion={protocolVersion:1,ownerId:a.id,operationId:randomUUID(),command:{kind:'delete-workout',workoutId:completion.id,expectedRevision:'3'}};
  const deleted=await request('/api/workouts/history/commands',a,deletion,200,true);
  check(deleted.receipt.revision==='4'&&deleted.receipt.current.state==='deleted','Delete did not persist a revisioned tombstone');
  check(isDeepStrictEqual(await request('/api/mobile/train/completions',a,upload),original),'Delete lost original create receipt');
  check((await request(detailPath,a)).record.state==='deleted','Original create resurrected deleted history');
  const removed=await request('/api/mobile/train/history/progress',a,{protocolVersion:1,ownerId:a.id,scope,retainedIds:[completion.id]});
  check(removed.coverage.workoutCount===0&&removed.records.length===0&&removed.resolved[0].record.state==='deleted','Progress retained deleted data');
  writeFileSync(resolve(artifactDirectory,'train-history-http-wire.json'),JSON.stringify({current,changed,conflict,accepted,deleted,progress,removed},null,2));
  const result={cases:['Native date-only create/read/first receipt and frozen raw-reader exclusion','Cookie and trusted MCP current reads, CAS conflict/review, scoped permission and immutable outcomes','Tombstones, original-create no resurrection, owner isolation and exact unknown coverage']};
  if(rootA){
    const preset=await rootA.client.from('exercises').select('id').eq('catalog_key','strength.barbell-bench-press.v1').single();
    check(!preset.error&&preset.data,'Verified root preset missing');
    const templateId=randomUUID();
    await request('/api/mobile/train/templates/commands',rootA,{protocolVersion:1,operationId:templateId,command:{kind:'create',name:'History origin proof',notes:null,entries:[{id:randomUUID(),exerciseId:preset.data.id,notes:null,restSeconds:null,targets:[{id:randomUUID(),kind:'working',measurements:{weightKg:0.123,reps:5,durationSeconds:null,distanceMeters:null}}]}]}});
    const active=(await request('/api/workouts',rootA,{title:'Retained Web active'},201,true)).workout;
    result.root={templateId,webActiveWorkoutId:active.id};
  }
  return result;
}
