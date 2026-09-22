import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {buildAssistantTurn,selectMemories,planningCalendarContext,memoryUpdate,type Memory,type PlanningState,assertPublicAssistantText} from '@/lib/ai/assistant-orchestrator';

const context={timezone:'America/Los_Angeles',tasks:[],projects:[]};
const golden=readFileSync('tests/fixtures/assistant/two-week-planning.txt','utf8');
it('selects temporary preferences for their actual planning period and preserves the baseline across expiry',()=>{
 const baseline:Memory={id:'baseline',key:'gym',kind:'routine',content:'Gym Monday–Saturday',confidence:1,temporality:'durable',effective_until:null,updated_at:'2026-09-01T00:00:00Z'};
 const temporary:Memory={...baseline,id:'exception',temporality:'temporary',content:'Four gym days for two weeks',effective_from:'2026-09-21T00:00:00Z',effective_until:'2026-10-05T00:00:00Z'};
 const vacation:Memory={...temporary,id:'vacation',key:'vacation',kind:'current_state',content:'On vacation for two weeks'};
 const plan=(startDate:string,endDate:string):PlanningState=>({status:'drafted',horizon:{startDate,endDate,timezone:'UTC'},readiness:{},facts:{},assumptions:[]});
 const ids=(planning:PlanningState)=>selectMemories([baseline,temporary,vacation],planning,new Date('2026-09-20')).map(memory=>memory.id);
 expect(ids(plan('2026-09-21','2026-10-04'))).toEqual(['exception','vacation']);
 expect(ids(plan('2026-09-28','2026-10-11'))).toEqual(['exception','vacation','baseline']);
 expect(ids(plan('2026-10-05','2026-10-18'))).toEqual(['baseline']);
 const inference:Memory={...temporary,id:'inference',kind:'inference',content:'Maybe prefers no gym',confidence:0.6};
 expect(selectMemories([baseline,inference],null,new Date('2026-09-25')).map(memory=>memory.id)).toEqual(['baseline']);
});
it('does not expose planner engine terminology',()=>expect(()=>assertPublicAssistantText('The planner engine will handle this.')).toThrow());
const output={intent:'planning',message:'Family time after pickup stays protected. Calls can remain tasks, with one clear next action.',actions:[],memoryUpdates:[],nextActionWindow:null,
 planning:{horizon:null,facts:[
  {dimension:'sleep',state:'missing',detail:null},
  {dimension:'caregiving',state:'partial',detail:'School Monday–Thursday; leave at 8:30. Pickup time unknown. Family time after pickup; Friday and weekends mostly family time.'},
  {dimension:'fixedCommitments',state:'known',detail:'School drop-off before 9.'},
  {dimension:'workBoundaries',state:'known',detail:'No focused work after pickup.'},
  {dimension:'meals',state:'known',detail:'Three meals, finish by 4pm.'},
  {dimension:'exercise',state:'known',detail:'Gym Monday–Saturday, rest Sunday.'},
  {dimension:'deadlines',state:'not_relevant',detail:null},
  {dimension:'priorities',state:'known',detail:'Handle admin early without blocking every call. Finish three hours of video work; split remaining focus equally between app and YouTube.'},
 ],questions:[],assumptions:[],draft:null,skipDiscovery:false}};
describe('planning discovery and draft contract',()=>{
 it.each([{questions:[]},{questions:[{dimension:'workBoundaries',question:'The requested times overlap protected commitments. Which different times should I use?'}]}])('surfaces a newly conflicting confirmed fact instead of silently continuing a draft ($questions)',({questions})=>{
  const prior:PlanningState={status:'drafted',horizon:{startDate:'2026-09-21',endDate:'2026-10-04',timezone:context.timezone},readiness:{horizon:'known',workBoundaries:'known'},facts:{workBoundaries:'At-home focus September 21 and 28, 11:00–11:30.'},assumptions:['Keep weekends mostly open.']};
  const candidate={...output,message:'The requested 09:00–09:30 times conflict with protected commitments. Nothing has changed.',planning:{...output.planning,facts:[{dimension:'workBoundaries',state:'partial',detail:'Requested 09:00–09:30 conflicts with protected 09:00–10:00.'}],questions,draft:null,assumptions:null}};
  const turn=buildAssistantTurn(candidate,context,prior,'Move both sessions to 09:00. Preserve protected events and ask about conflicts.','en');
  expect(turn.planning?.status).toBe('discovering');expect(turn.message).toContain('conflict with protected commitments');expect(turn.message).toContain('?');expect(turn.message).not.toContain('Start with one important');expect(turn.capture.items).toEqual([]);
  const skipped=buildAssistantTurn(candidate,context,prior,'Skip. Plan now.','en');
  expect(skipped.planning?.status).toBe('drafted');expect(skipped.message).not.toContain('Assumption:');expect(skipped.planning?.assumptions).toContain('Focused work hours: not confirmed; keep this flexible.');expect(skipped.capture.items).toEqual([]);
  expect(turn.planning?.assumptions).toEqual(prior.assumptions);expect(skipped.planning?.assumptions).toContain(prior.assumptions[0]);
  const cleared=buildAssistantTurn({...candidate,planning:{...candidate.planning,assumptions:[]}},context,prior,'Remove the previous assumption and clarify the conflict.','en');expect(cleared.planning?.assumptions).toEqual([]);
 });
 it('clears old travel for a no-travel draft but never normalizes a zero duration',()=>{
  const prior=buildAssistantTurn({...output,planning:{...output.planning,travelMinutes:15}},context,null,'A trip takes 15 minutes.','en').planning;
  const candidate={...output,planning:{...output.planning,travelMinutes:null,draft:'Two focus blocks at home; no travel reservations.',skipDiscovery:true}};
  const turn=buildAssistantTurn(candidate,context,prior,'No travel is needed. Plan now.','en');
  expect(turn.planning?.travelMinutes).toBeNull();expect(turn.planning?.status).toBe('drafted');expect(turn.capture.items).toEqual([]);
  for(const travelMinutes of [0,-1,1441])expect(()=>buildAssistantTurn({...candidate,planning:{...candidate.planning,travelMinutes}},context,prior,'No travel is needed.','en')).toThrow();
 });
 it('preserves, corrects and withdraws only explicitly confirmed travel duration',()=>{
  const first=buildAssistantTurn({...output,planning:{...output.planning,travelMinutes:15}},context,null,'The trip takes 15 minutes. Plan now.','en');
  const next=buildAssistantTurn(output,context,first.planning,'Skip. Plan now.','en');expect(next.planning?.travelMinutes).toBe(15);
  const corrected=buildAssistantTurn({...output,planning:{...output.planning,travelMinutes:20}},context,next.planning,'Actually 20 minutes.','en');expect(corrected.planning?.travelMinutes).toBe(20);
  const unknown=buildAssistantTurn({...output,planning:{...output.planning,travelMinutes:null}},context,next.planning,'That travel time is no longer known.','en');expect(unknown.planning?.travelMinutes).toBeNull();
 });
 it('validates temporary duration without accepting model timestamps or durable current state',()=>{
  const update={operation:'upsert',kind:'routine',key:'gym',content:'Four days per week',confidence:1,temporality:'temporary',validFor:{amount:1,unit:'months'}};
  expect(memoryUpdate.parse(update)).toEqual(update);
  for(const candidate of [{...update,effective_until:'2099-01-01'},{...update,validFor:{amount:13,unit:'months'}},{...update,kind:'current_state',temporality:'durable',validFor:null}])expect(memoryUpdate.safeParse(candidate).success).toBe(false);
 });
 it('still drafts on explicit skip when the model omits a draft',()=>{
  const turn=buildAssistantTurn(output,context,null,'Skip. Plan now.','en');
  expect(turn.planning?.status).toBe('drafted');expect(turn.message).not.toContain('?');
  expect(turn.planning?.facts.exercise).toContain('Gym Monday–Saturday');expect(turn.message).not.toContain('not confirmed');
  expect(turn.capture.items).toEqual([]);
 });
 it('asks only material questions for a narrow plan',()=>{
  const turn=buildAssistantTurn({...output,planning:{...output.planning,facts:[],questions:[{dimension:'deadlines',question:'When is the report due?'}]}},context,null,'Help me plan this report.','en');
  expect(turn.message).toContain('When is the report due?');expect(turn.message).not.toContain('sleep and wake');
 });
 it('finishes narrow-plan discovery after its material question is answered',()=>{
  const first=buildAssistantTurn({...output,planning:{...output.planning,horizon:{startDate:'2026-09-21',endDate:'2026-09-21',timezone:context.timezone},facts:[{dimension:'workBoundaries',state:'known',detail:'One hour this morning.'},{dimension:'priorities',state:'known',detail:'Finish the report.'}],questions:[{dimension:'deadlines',question:'When is the report due?'}]}},context,null,'Help me outline the report work.','en');
  const next=buildAssistantTurn({...output,planning:{...output.planning,facts:[{dimension:'deadlines',state:'known',detail:'Due this afternoon.'}],draft:'Start with the outline, then finish the report before the afternoon deadline.'}},context,first.planning,'This afternoon.','en');
  expect(next.planning?.status).toBe('drafted');expect(next.missing).toEqual([]);expect(next.message).not.toMatch(/sleep|caregiving|meals|\?/i);
 });
 it.each(['endpoint','capture step','subsystem','unsupported schedule optimization','creation intent'])('rejects internal language in every rendered surface: %s',term=>{
  for(const planning of [{...output.planning,questions:[{dimension:'horizon',question:`Which ${term}?`}]},{...output.planning,draft:'A flexible draft.',skipDiscovery:true,assumptions:[`Use this ${term}.`]}]){
   expect(()=>buildAssistantTurn({...output,planning},context,null,golden,'en')).toThrow();
  }
 });
 it('uses a temporary override while effective, then returns to the unchanged durable routine',()=>{
  const durable:Memory={id:'durable',kind:'routine',key:'gym',content:'Gym Monday–Saturday',confidence:1,temporality:'durable',updated_at:'2026-09-01T00:00:00Z',effective_until:null};
  const temporary:Memory={...durable,id:'temporary',content:'Gym four days a week',temporality:'temporary',effective_from:'2026-09-20T00:00:00Z',effective_until:'2026-10-20T00:00:00Z'};
  expect(selectMemories([durable,temporary],null,new Date('2026-09-21')).map(m=>m.id)).toEqual(['temporary']);
  expect(selectMemories([durable,temporary],null,new Date('2026-10-21')).map(m=>m.id)).toEqual(['durable']);
  expect(selectMemories([durable,temporary],null,new Date('2026-09-19')).map(m=>m.id)).toEqual(['durable']);
 });
 it('lets an explicit draft request override reopening caused by withdrawn dates',()=>{
  const first=buildAssistantTurn({...output,planning:{...output.planning,horizon:{startDate:'2026-09-21',endDate:'2026-10-04',timezone:context.timezone}}},context,null,golden,'en');
  const next=buildAssistantTurn({...output,planning:{...output.planning,facts:[{dimension:'horizon',state:'missing',detail:null}],skipDiscovery:true,draft:'A flexible draft without fixed dates.'}},context,first.planning,'Forget those dates and make a flexible draft now.','en');
  expect(next.planning?.horizon).toBeNull();expect(next.planning?.status).toBe('drafted');
  expect(next.message).toContain('A flexible draft without fixed dates.');
 });
 it('allows the user to resolve the last custom assumption',()=>{
  const draft=buildAssistantTurn({...output,planning:{...output.planning,assumptions:['Keep gym duration flexible.'],draft:'A flexible draft.'}},context,null,'Skip. Plan now.','en');
  const revised=buildAssistantTurn({...output,planning:{...output.planning,facts:[{dimension:'exercise',state:'known',detail:'Gym takes one hour.'}],assumptions:[],draft:'Allow one hour for gym.'}},context,draft.planning,'Gym takes one hour, use that duration.','en');
  expect(revised.planning?.status).toBe('drafted');
  expect(revised.message).not.toContain('Keep gym duration flexible.');
  expect(revised.message).toContain('Allow one hour for gym.');
 });
 it('lets the user reopen discovery after a skipped draft',()=>{
  const draft=buildAssistantTurn({...output,planning:{...output.planning,draft:'A flexible draft.'}},context,null,'Skip. Plan now.','en');
  const reopened=buildAssistantTurn({...output,planning:{...output.planning,reopenDiscovery:true}},context,draft.planning,'Ask me the missing questions before revising.','en');
  expect(reopened.planning?.status).toBe('discovering');
  expect(reopened.message).toContain('Which dates');
  expect(reopened.planning?.assumptions).toEqual([]);
 });
 it('removes resolved assumptions when refining with newly confirmed dates',()=>{
  const draft=buildAssistantTurn({...output,planning:{...output.planning,draft:'A flexible draft.'}},context,null,'Skip. Plan now.','en');
  const revised=buildAssistantTurn({...output,planning:{...output.planning,facts:[],horizon:{startDate:'2026-09-21',endDate:'2026-10-04',timezone:context.timezone},draft:'Use the confirmed two weeks.'}},context,draft.planning,'Use September 21 through October 4.','en');
  expect(revised.planning?.status).toBe('drafted');
  expect(revised.message).not.toContain('Dates');
  expect(revised.message).not.toContain('Sleep and wake times');expect(revised.planning?.assumptions).toContain('Sleep and wake times: not confirmed; keep this flexible.');
 });
 it('reopens date discovery when dates are withdrawn from a complete draft',()=>{
  const draft=buildAssistantTurn({...output,planning:{...output.planning,horizon:{startDate:'2026-09-21',endDate:'2026-10-04',timezone:context.timezone},facts:output.planning.facts.map(fact=>({...fact,state:'known',detail:'Confirmed'})),draft:'A dated plan.'}},context,null,'Make the plan.','en');
  const next=buildAssistantTurn({...output,planning:{...output.planning,facts:[{dimension:'horizon',state:'missing',detail:null}]}},context,draft.planning,'Forget those dates. I will confirm new ones later.','en');
  expect(next.planning?.horizon).toBeNull();expect(next.planning?.status).toBe('discovering');
  expect(next.missing).toEqual(['horizon']);expect(next.message).toContain('Which dates');
 });
 it('continues refining a skipped draft using its existing assumptions',()=>{
  const draft=buildAssistantTurn({...output,planning:{...output.planning,assumptions:['Keep gym duration flexible.'],draft:'A flexible two-week draft.'}},context,null,'Skip. Plan now.','en');
  const revised=buildAssistantTurn({...output,planning:{...output.planning,facts:[],assumptions:null,draft:'Move gym sessions to mornings.'}},context,draft.planning,'Move gym sessions to mornings.','en');
  expect(revised.planning?.status).toBe('drafted');
  expect(revised.message).toContain('Move gym sessions to mornings.');
  expect(revised.message).not.toContain('Which dates');
  expect(revised.planning?.assumptions).toEqual(draft.planning?.assumptions);
  expect(revised.capture.items).toEqual([]);
 });
 it('withdraws confirmed dates and asks for a replacement range',()=>{
  const first=buildAssistantTurn({...output,planning:{...output.planning,horizon:{startDate:'2026-09-21',endDate:'2026-10-04',timezone:context.timezone}}},context,null,golden,'en');
  const next=buildAssistantTurn({...output,planning:{...output.planning,facts:[{dimension:'horizon',state:'missing',detail:null}]}},context,first.planning,'Cancel those dates; I do not know when my leave starts.','en');
  expect(next.planning?.horizon).toBeNull();
  expect(next.planning?.readiness.horizon).toBe('missing');
  expect(next.planning?.status).toBe('discovering');
  expect(next.message).toContain('Which dates');
  expect(next.capture.items).toEqual([]);
 });
 it('asks one material question while retaining remaining gaps, without creating schedule changes',()=>{
  const turn=buildAssistantTurn(output,context,null,golden,'en');
  expect(turn.planning?.status).toBe('discovering');
  expect(turn.missing).toEqual(['horizon','sleep','caregiving']);
  expect(turn.message).toContain('Which dates');expect(turn.message).not.toContain('sleep and wake');
  expect(turn.message.match(/\?/g)).toHaveLength(1);
  expect(turn.message).toContain('Calls can remain tasks');expect(turn.message).toContain('Family time');
  expect(turn.message).not.toMatch(/capture step|subsystem|unsupported schedule optimization|endpoint limitation/);
  expect(turn.capture.items).toEqual([]);expect(turn.ui.quickReplies[0].value).toBe('Skip. Plan now.');
 });
 it.each(['en','zh'] as const)('asks for unknown availability with conversational duration choices (%s)',locale=>{
  const candidate={...output,intent:'next_action',planning:null,message:'Choose a time.'};
  const turn=buildAssistantTurn(candidate,context,null,'What should I do next?',locale);
  expect(turn.nextActionWindow).toBeNull();expect(turn.capture.items).toEqual([]);
  expect(turn.ui.quickReplies.map(reply=>reply.id)).toEqual(['available-15','available-30','available-60']);
  expect(turn.ui.quickReplies[0].value).toBe(locale==='zh'?'我现在有 15 分钟空闲，请建议接下来做什么。':'I have 15 minutes free now. What should I do next?');
  const window={start:'2026-09-21T12:00:00Z',end:'2026-09-21T12:15:00Z',available:true};
  const ready=buildAssistantTurn({...candidate,nextActionWindow:window},context,null,turn.ui.quickReplies[0].value,locale);
  expect(ready.nextActionWindow).toEqual(window);expect(ready.ui.quickReplies).toEqual([]);
 });
 it('skips discovery with explicit unknowns and keeps the plan a prose draft',()=>{
  const first=buildAssistantTurn(output,context,null,golden,'en');
  const draft=buildAssistantTurn({...output,planning:{...output.planning,facts:[],draft:'Across both weeks, keep afternoons for family. Make one admin call before choosing the next task.'}},context,first.planning,'Skip. Plan now.','en');
  expect(draft.planning?.status).toBe('drafted');expect(draft.planning?.horizon).toBeNull();
  expect(draft.planning?.assumptions).toEqual(expect.arrayContaining(['Dates: not confirmed; keep this flexible.','Sleep and wake times: not confirmed; keep this flexible.','Pickup and caregiving times: not confirmed; keep this flexible.']));
  expect(draft.message).toContain('no tasks or calendar entries have been changed');expect(draft.capture.items).toEqual([]);expect(draft.ui.quickReplies).toEqual([]);
 });
 it('captures a multi-day horizon and does not re-ask known dates or preferences',()=>{
  const first=buildAssistantTurn(output,context,null,golden,'en');
  const next=buildAssistantTurn({...output,planning:{...output.planning,draft:'Keep each afternoon for family and prioritize admin calls early in the first week.',horizon:{startDate:'2026-09-21',endDate:'2026-10-04',timezone:context.timezone},facts:[{dimension:'sleep',state:'known',detail:'Sleep 10pm, wake 6am.'},{dimension:'caregiving',state:'known',detail:'Leave at 3pm for pickup; then family time.'}]}},context,first.planning,'Sep 21–Oct 4, sleep 10 to 6, pickup 3.','en');
  expect(next.planning?.horizon?.endDate).toBe('2026-10-04');expect(next.missing).toEqual([]);expect(next.planning?.facts.exercise).toContain('Gym');expect(next.planning?.status).toBe('drafted');
 });
 it('rejects invalid horizons, arbitrary mutations and fabricated known facts',()=>{
  expect(()=>buildAssistantTurn({...output,planning:{...output.planning,horizon:{startDate:'2026-02-31',endDate:'2026-03-02',timezone:'UTC'}}},context,null,golden,'en')).toThrow();
  expect(()=>buildAssistantTurn({...output,actions:[{kind:'task-create',title:'Unapproved task',estimateMinutes:null,dueDate:null,projectId:null,projectKey:null}]},context,null,golden,'en')).toThrow();
  expect(()=>buildAssistantTurn({...output,planning:{...output.planning,facts:[{dimension:'sleep',state:'known',detail:null}]}},context,null,golden,'en')).toThrow();
 });
 it('honors explicit relevance corrections while preserving omitted facts',()=>{
  const first=buildAssistantTurn(output,context,null,golden,'en');
  const next=buildAssistantTurn({...output,planning:{...output.planning,facts:[{dimension:'caregiving',state:'not_relevant',detail:null}]}},context,first.planning,'No caregiving commitments this time.','en');
  expect(next.missing).toEqual(['horizon','sleep']);expect(next.planning?.facts.caregiving).toBeUndefined();expect(next.planning?.facts.exercise).toContain('Gym');expect(next.message).not.toContain('3.');
 });
 it('does not treat a negated or quoted skip as a command',()=>{
  for(const latest of ["Don't skip; ask me questions first.",'What does “plan now” mean?']){
   const turn=buildAssistantTurn(output,context,null,latest,'en');expect(turn.planning?.status).toBe('discovering');
  }
 });
 it('bounds relevant calendar reservations, not unrelated old history, preserving recurring exceptions',()=>{
  const old=Array.from({length:1100},(_,i)=>({id:`old-${i}`,title:'Old private appointment',start_date:'2020-01-01',end_date:'2020-01-01',start_time:'08:00',end_time:'09:00',is_recurring:false}));
  const recurring={id:'school',title:'School',start_date:'2020-01-01',end_date:'2020-01-01',start_time:'08:00',end_time:'09:00',is_recurring:true,is_protected:true,recurrence_rule:{frequency:'daily' as const,interval:1}};
  const exception={...recurring,id:'exception',title:'Changed school time',is_recurring:false,is_exception:true,recurring_event_id:'school',original_date:'2026-09-21',start_date:'2026-09-21',end_date:'2026-09-21',start_time:'10:00',end_time:'11:00'};
  const calendar=planningCalendarContext([...old,recurring,exception],{startDate:'2026-09-21',endDate:'2026-09-22',timezone:'UTC'});
  expect(calendar).toEqual([{title:'Changed school time',start:'2026-09-21T10:00:00.000Z',end:'2026-09-21T11:00:00.000Z',protected:true,recurring:true},{title:'School',start:'2026-09-22T08:00:00.000Z',end:'2026-09-22T09:00:00.000Z',protected:true,recurring:true}]);
 });
 it('selects bounded durable context without promoting inference or reviving expired temporary facts',()=>{
  const memories:Memory[]=Array.from({length:30},(_,i)=>({id:String(i),kind:'preference',key:String(i),content:'A preference',confidence:1,temporality:'durable',updated_at:'2026-09-19T00:00:00Z',effective_until:null}));
  memories.unshift({...memories[0],id:'stale',kind:'current_state',temporality:'temporary',effective_until:'2026-09-18T00:00:00Z'});
  const selected=selectMemories(memories,null,new Date('2026-09-19'));
  expect(selected).toHaveLength(24);expect(selected.some(m=>m.id==='stale')).toBe(false);
  const inference={...memories[1],kind:'inference',confidence:0.6};expect(selectMemories([inference],null,new Date('2026-09-19'))[0].kind).toBe('inference');
  const current={...memories[0],id:'current',key:'time-off',kind:'current_state',content:'Off work for two weeks',temporality:'temporary' as const,effective_until:'2026-10-01T00:00:00Z'};
  expect(selectMemories([...memories,current],null,new Date('2026-09-19')).map(memory=>memory.id)).toContain('current');
 });
});

it.each(['zh','en'] as const)('keeps assumption inventories internal instead of appending them to replies (%s)',locale=>{
 const draft=locale==='zh'?'先休息；如果今天必须处理事情，就只挑一件小事。':'Rest first; if something must be done today, choose just one small task.';
 const turn=buildAssistantTurn({...output,planning:{...output.planning,facts:[],skipDiscovery:true,draft,assumptions:['Keep family time protected.']}},context,null,'Skip. Plan now.',locale);
 expect(turn.planning?.assumptions).toHaveLength(10);
 expect(turn.planning?.assumptions).toContain('Keep family time protected.');
 expect(turn.message).toBe(`${locale==='zh'?'草稿 — 尚未更改任务或日历。':'Draft — no tasks or calendar entries have been changed.'}\n\n${draft}`);
 expect(turn.capture.items).toEqual([]);expect(turn.planning?.horizon).toBeNull();
});

it.each(['zh','en'] as const)('fallback gives one untimed next step without dumping planning facts (%s)',locale=>{
 const turn=buildAssistantTurn({...output,planning:{...output.planning,skipDiscovery:true,draft:null}},context,null,'Skip. Plan now.',locale);
 expect(turn.message.length).toBeLessThan(250);
 expect(turn.message).not.toMatch(/Assumption|假设|not confirmed|尚未确认|\d{1,2}:\d{2}/);
 expect(turn.message).not.toContain('Gym Monday–Saturday');
 expect(turn.planning?.facts.exercise).toBe('Gym Monday–Saturday, rest Sunday.');
 expect(turn.planning?.readiness.sleep).toBe('missing');expect(turn.capture.items).toEqual([]);
});

it.each([
 ['zh','今天生病了','今天先把恢复放在前面。先休息，必要的事只留一件小事。'],
 ['en','I am tired today','Keep today light. Start with a break, then choose one small task if needed.'],
 ['zh','我脑子很乱，不知道先做什么','先把最挂心的一件事写下来。它是什么？'],
] as const)('ordinary support does not start schedule discovery: %s %s',(locale,latest,message)=>{
 const turn=buildAssistantTurn({...output,intent:'conversation',message,planning:null},context,null,latest,locale);
 expect(turn.message).toBe(message);expect(turn.planning).toBeNull();expect(turn.capture.items).toEqual([]);
 expect(turn.message.match(/[?？]/g)?.length??0).toBeLessThanOrEqual(1);
});