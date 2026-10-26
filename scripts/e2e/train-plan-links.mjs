import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Real authenticated requests; no fake persisted success or private user data.
export async function verifyTrainPlans({ a, b, rootA, request, mcp, parsedTool, artifactDirectory }) {
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const endpoint = '/api/mobile/train/plans/commands';
  async function planner(user, value) {
    const result = await user.client.rpc('planner_routine_command', { p_request: value });
    check(!result.error && result.data?.status === 'complete', 'Planner command did not complete');
    return result.data;
  }
  async function create(user, title) {
    const preset = await user.client.from('exercises').select('id,name').eq('catalog_key','strength.barbell-bench-press.v1').single();
    check(!preset.error && preset.data, 'Verified preset missing');
    const templateId = randomUUID();
    await request('/api/mobile/train/templates/commands', user, { protocolVersion:1,operationId:templateId,command:{kind:'create',name:title,notes:null,entries:[{id:randomUUID(),exerciseId:preset.data.id,notes:null,restSeconds:null,targets:[{id:randomUUID(),kind:'warmup',measurements:{weightKg:0.123,reps:5,durationSeconds:null,distanceMeters:null}}]}]} });
    await planner(user, {operation:'create',operationId:randomUUID(),activityKind:'training',repeatMode:'once',title,date:'2026-11-05',startTime:'10:00',endTime:'11:00',timezone:'UTC',protected:false,rule:{frequency:'daily',interval:1},trainingTemplateId:templateId});
    const list = await request('/api/mobile/train/plans?date=2026-11-05',user);
    check(list.plans.length === 1 && list.plans[0].templateId === templateId, 'Plan lost explicit template');
    return { templateId, plan: list.plans[0], preset: preset.data };
  }
  const { plan, preset } = await create(a,'Linked training');
  const completion = {version:2,id:randomUUID(),ownerId:a.id,sourceId:randomUUID(),startedAt:'2026-11-05T09:00:00.123Z',completedAt:'2026-11-05T09:05:00.123Z',durationSeconds:300,timezone:'UTC',workoutDay:'2026-11-05',planId:'opaque provenance',exercises:[{id:randomUUID(),definition:{catalogKey:'strength.barbell-bench-press.v1',name:{en:preset.name,zh:preset.name},equipment:'barbell',mode:'weight_reps',convention:'barbell-total'},sets:[{id:randomUUID(),performed:{mode:'weight_reps',weightKg:0.123,reps:5,kind:'warmup'}}]}]};
  const upload = {protocolVersion:1,operationId:completion.id,completion};
  await request('/api/mobile/train/completions',a,upload);
  const linkRequest={protocolVersion:1,ownerId:a.id,operationId:randomUUID(),command:{kind:'link-workout',workoutId:completion.id,occurrenceId:plan.occurrenceId}};
  const links=await Promise.all([request(endpoint,a,linkRequest),request(endpoint,a,linkRequest)]);
  check(isDeepStrictEqual(links[0],links[1]),'Concurrent link retry changed first receipt');
  const linked=await request(`/api/mobile/train/plans/workouts/${completion.id}`,a);
  check(linked.link.current.completed === false,'Association automatically fulfilled plan');
  const intent={protocolVersion:1,ownerId:a.id,operationId:randomUUID(),command:{kind:'fulfill-plan',occurrenceId:plan.occurrenceId,expected:plan.version}};
  await planner(a,{operation:'edit',operationId:randomUUID(),seriesId:plan.seriesId,occurrenceId:plan.occurrenceId,expectedSeriesToken:plan.version.seriesToken,expectedOccurrenceVersion:plan.version.occurrenceVersion,expectedTaskVersion:plan.version.taskVersion,expectedEventVersion:plan.version.eventVersion,title:'Moved after saved workout',date:'2026-11-09',startTime:'12:00',endTime:'13:00',trainingTemplateId:null});
  const rejected=await request(endpoint,a,intent,409);
  check(rejected.error.code === 'changed' && rejected.rejection.current.plannedDay === '2026-11-09','Changed intent did not require review');
  check(isDeepStrictEqual(await request(endpoint,a,intent,409),rejected),'Changed intent retry lost first outcome');
  const accepted=await request(endpoint,a,{...intent,operationId:randomUUID(),command:{...intent.command,expected:rejected.rejection.current.version}});
  check(accepted.receipt.outcome === 'completed' && accepted.receipt.changeId,'Reviewed fulfillment was not acknowledged');
  const already=await request(endpoint,a,{...intent,operationId:randomUUID()});
  check(already.receipt.outcome === 'already-completed' && already.receipt.changeId === null,'Already complete claimed new effect');
  const day=await request('/api/mobile/train/day',a,{protocolVersion:1,ownerId:a.id,day:'2026-11-05',before:null});
  check(day.workouts.length === 1 && isDeepStrictEqual(day.workouts[0].workout,completion) && day.workouts[0].link.current.plannedDay === '2026-11-09','Day read rewrote or redated actual work');
  const web=(await request(`/api/workouts/${completion.id}`,a,undefined,200,true)).workout;
  check(web.trainingPlanLink?.occurrenceId === plan.occurrenceId && isDeepStrictEqual(web.recorded_completion,completion),'Continuing cookie detail lost association/capture');
  const assistant=parsedTool(await mcp(a,'getWorkoutDetails',{workoutId:completion.id},['read']));
  check(assistant.trainingPlanLink?.occurrenceId === plan.occurrenceId,'Trusted Assistant detail lost association');
  await request(`/api/mobile/train/plans/${plan.occurrenceId}`,b,undefined,404);
  await request(`/api/mobile/train/plans/workouts/${completion.id}`,b,undefined,404);
  await request(endpoint,b,linkRequest,403);
  check((await a.client.from('train_workout_plan_links').insert({workout_id:randomUUID(),owner_id:a.id,captured_occurrence_id:plan.occurrenceId})).error?.code === '42501','Direct link bypass survived');
  writeFileSync(resolve(artifactDirectory,'train-422-424-http-wire.json'),JSON.stringify({detail:await request(`/api/mobile/train/plans/${plan.occurrenceId}`,a),association:links[0],changed:rejected,fulfillment:accepted,already,day},null,2));
  const result={cases:['Actual upload/link concurrent first receipts without automatic fulfillment','Changed/reviewed/already-completed authoritative planner outcomes','Persisted day and current moved placement with cookie/Assistant reads','Foreign account and direct-write isolation']};
  if(rootA){
    const root=await create(rootA,'Root linked training');
    const active=(await request('/api/workouts',rootA,{title:'Retained Web active'},201,true)).workout;
    result.root={templateId:root.templateId,occurrenceId:root.plan.occurrenceId,planDay:'2026-11-05',plan:root.plan,webActiveWorkoutId:active.id};
  }
  return result;
}
