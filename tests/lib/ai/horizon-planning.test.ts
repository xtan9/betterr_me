import {expect,it} from 'vitest';
import {buildHorizonPreview,horizonPlanningRequest,horizonContext} from '@/lib/ai/horizon-planning';
import type {PlanningContext} from '@/lib/ai/guided-planning';
import {goldenContext,goldenInput,goldenDraft} from '../../fixtures/assistant/phase-b-golden';
const id='61500000-0000-0000-0000-000000000003';
const context:PlanningContext={version:id,timezone:'America/Los_Angeles',tasks:[],events:[],priorities:{version:null,taskIds:[]}};
const input={requestId:id,consent:true as const,locale:'en' as const,horizon:{startDate:'2026-10-30',endDate:'2026-11-02',timezone:'America/Los_Angeles'},commitments:'Family after 15:00, weekends family',needs:'',goals:'',travelMinutes:null};
const event=(date:string,startTime='10:00',endTime='11:00')=>({date,startTime,endTime,kind:'event-create',targetId:null,title:'Focus',taskId:null,taskItemIndex:null,protected:false,category:'work'});
const output=(events:unknown[])=>({message:'Review the dates',questions:[],assumptions:[],capture:{message:'',actions:[]},events,priorityTaskIds:null});
it('validates an authored golden fortnight with distinct school days, Friday childcare and family-first weekends',()=>{
 const events:PlanningContext['events']=[];
 for(let offset=0;offset<14;offset++){
  const instant=new Date(Date.UTC(2026,8,21+offset)),date=instant.toISOString().slice(0,10),day=instant.getUTCDay();
  const protect=(title:string,start:string,end:string)=>events.push({id:`${date}-${title}`,title,start_date:date,end_date:date,start_time:start,end_time:end,timezone:goldenInput.horizon.timezone,is_protected:true,is_recurring:false});
  protect('Sleep','00:00','06:00');protect('Evening sleep','22:00','23:59');
  protect('Family',day>=1&&day<=4?'15:15':'08:00','22:00');
  if(day>=1&&day<=4){protect('Drop-off','08:30','08:45');protect('Pickup','14:45','15:15');}
 }
 const draft=goldenDraft(),result=buildHorizonPreview(draft,goldenInput,{...goldenContext,events});
 expect(result.events).toHaveLength(20);expect(result.capture.items).toHaveLength(7);expect(result.freeTime.length).toBeGreaterThan(14);
 expect(result.events.filter(event=>event.changes.title==='Gym')).toHaveLength(12);
 expect(result.events.some(event=>/call|clean/i.test(String(event.changes.title)))).toBe(false);
 expect(()=>buildHorizonPreview({...draft,events:[...draft.events,{...draft.events[0],date:'2026-09-25',title:'Extra focused work',startTime:'10:00',endTime:'11:00'}]},goldenInput,{...goldenContext,events})).toThrow('overlap');
});
it('builds one dated envelope across the fall DST transition, leaving family/weekend time open',()=>{
 const body=buildHorizonPreview(output([event('2026-10-30'),event('2026-11-02')]),input,context);
 expect(body.events.map(item=>item.changes)).toMatchObject([{start_date:'2026-10-30',start_time:'10:00',end_time:'11:00'},{start_date:'2026-11-02',start_time:'10:00',end_time:'11:00'}]);
 expect(body.freeTime).toContainEqual({start:'2026-11-01T07:00:00.000Z',end:'2026-11-02T08:00:00.000Z'});
 expect(horizonContext(context,input.horizon).days.map(day=>day.weekday)).toEqual(['Friday','Saturday','Sunday','Monday']);
});
it('checks recurring commitments on a later day, rather than only the first day',()=>{
 const events=[{id,title:'Pickup',start_date:'2026-10-01',end_date:'2026-10-01',start_time:'10:30',end_time:'11:30',is_recurring:true,recurrence_rule:{frequency:'weekly' as const,interval:1,days_of_week:[1]},timezone:'America/Los_Angeles'}];
 expect(()=>buildHorizonPreview(output([event('2026-11-02')]),input,{...context,events})).toThrow('overlap');
});
it('rejects an outside date and duplicate target without producing a partial preview',()=>{
 expect(()=>buildHorizonPreview(output([event('2026-10-30'),event('2026-11-03')]),input,context)).toThrow('outside');
 expect(horizonPlanningRequest.safeParse({...input,horizon:{...input.horizon,endDate:'2026-10-29'}}).success).toBe(false);
});
it('rejects nonexistent spring-forward times and preserves the later fall-back fold',()=>{
 const spring={...input,horizon:{...input.horizon,startDate:'2026-03-07',endDate:'2026-03-09'}};
 expect(()=>buildHorizonPreview(output([event('2026-03-08','02:30','03:30')]),spring,context)).toThrow('Nonexistent');
 const body=buildHorizonPreview(output([event('2026-11-01','01:30','02:30')]),input,context);
 expect(body.freeTime).toContainEqual({start:'2026-11-01T07:00:00.000Z',end:'2026-11-01T09:30:00.000Z'});
});
it('never invents travel or emits changes while asking a question',()=>{
 const body=buildHorizonPreview(output([{...event('2026-11-02'),category:'travel'}]),input,context);
 expect(body.events).toEqual([]);expect(body.questions).toHaveLength(1);
});
it.each(['event-edit','event-remove'])('allows %s of an event ending at the final midnight, but not beyond it',(kind)=>{
 const before={id,version:id,title:'Late work',start_date:'2026-11-02',end_date:'2026-11-03',start_time:'23:00',end_time:'00:00',timezone:'America/Los_Angeles',app_owned:true,is_protected:false,is_recurring:false};
 const actions=output([{...event('2026-11-02','22:00','23:00'),kind,targetId:id}]);
 expect(buildHorizonPreview(actions,input,{...context,events:[before]}).events[0]).toMatchObject({kind,targetId:id,before});
 expect(()=>buildHorizonPreview(actions,input,{...context,events:[{...before,end_time:'00:01'}]})).toThrow('Target outside horizon');
 // The original event may use another zone: compare instants, not civil dates.
 expect(buildHorizonPreview(actions,input,{...context,events:[{...before,start_date:'2026-11-03',start_time:'07:00',end_time:'08:00',timezone:'UTC'}]}).events).toHaveLength(1);
});
it('uses inclusive end dates for all-day target containment',()=>{
 const before={id,version:id,title:'All day',start_date:'2026-11-02',end_date:'2026-11-02',start_time:null,end_time:null,timezone:'America/Los_Angeles',app_owned:true,is_protected:false,is_recurring:false};
 const actions=output([{...event('2026-11-02'),kind:'event-remove',targetId:id}]);
 expect(buildHorizonPreview(actions,input,{...context,events:[before]}).events).toHaveLength(1);
 for(const outside of [{...before,end_date:'2026-11-03'},{...before,start_date:'2026-11-03',end_date:'2026-11-03'}])expect(()=>buildHorizonPreview(actions,input,{...context,events:[outside]})).toThrow('Target outside horizon');
});
it('rejects overlapping proposed blocks and preserves a protected target on a later day',()=>{
 expect(()=>buildHorizonPreview(output([event('2026-11-02'),event('2026-11-02','10:30','11:30')]),input,context)).toThrow('overlap');
 const before={id,version:id,title:'Family',start_date:'2026-11-02',end_date:'2026-11-02',start_time:'15:00',end_time:'18:00',timezone:input.horizon.timezone,app_owned:true,is_protected:true,is_recurring:false};
 expect(()=>buildHorizonPreview(output([{...event('2026-11-02'),kind:'event-remove',targetId:id}]),input,{...context,events:[before]})).toThrow('Unsupported event edit');
});
it('rejects wrong confirmed travel duration and duplicate recurring occupancy',()=>{
 expect(()=>buildHorizonPreview(output([{...event('2026-11-02'),category:'travel'}]),{...input,travelMinutes:15},context)).toThrow('duration');
 const before={id,title:'Gym',start_date:'2026-10-01',end_date:'2026-10-01',start_time:'10:00',end_time:'11:00',timezone:input.horizon.timezone,is_recurring:true,recurrence_rule:{frequency:'daily' as const,interval:1}};
 expect(()=>buildHorizonPreview(output([event('2026-11-02')]),input,{...context,events:[before]})).toThrow('overlap');
 expect(()=>buildHorizonPreview({...output([]),capture:{message:'',actions:[{kind:'routine-create',title:'Gym',date:'2026-10-30',startTime:'10:00',endTime:'11:00',timezone:input.horizon.timezone,protected:false,frequency:'weekly',daysOfWeek:[1,2,3,4,5,6]}]}},input,context)).toThrow('Unsupported horizon capture');
});
it.each([180,null])('refuses a task with estimate %s that cannot safely fit its proposed reservation',estimate=>{
 const tasks=[{id,title:'Finish video',version:id,estimate_minutes:estimate,due_date:null,project_id:null}];
 expect(()=>buildHorizonPreview(output([{...event('2026-11-02'),taskId:id}]),input,{...context,tasks})).toThrow('Task does not fit');
});
it('uses the exact previewed task estimate when validating a new linked reservation',()=>{
 const draft={...output([{...event('2026-11-02','10:00','13:00'),taskItemIndex:0}]),capture:{message:'',actions:[{kind:'task-create',title:'Finish video',estimateMinutes:180,dueDate:null,projectId:null,projectKey:null}]}};
 const body=buildHorizonPreview(draft,input,context);expect(body.events[0].taskItemId).toBe(body.capture.items[0].id);
 expect(()=>buildHorizonPreview({...draft,events:[{...event('2026-11-02'),taskItemIndex:0}]},input,context)).toThrow('Task does not fit');
});
it('compares reservations in different timezones by instant across DST',()=>{
 const before={id,title:'Protected in New York',start_date:'2026-11-02',end_date:'2026-11-02',start_time:'13:00',end_time:'14:00',timezone:'America/New_York',is_protected:true,is_recurring:false};
 expect(()=>buildHorizonPreview(output([event('2026-11-02')]),input,{...context,events:[before]})).toThrow('overlap');
 expect(buildHorizonPreview(output([event('2026-11-02','11:00','12:00')]),input,{...context,events:[before]}).events).toHaveLength(1);
});
it('validates an existing task against its proposed estimate edit, not its old estimate',()=>{
 const tasks=[{id,title:'Finish video',version:id,estimate_minutes:30,due_date:null,project_id:null}];
 const draft={...output([{...event('2026-11-02'),taskId:id}]),capture:{message:'',actions:[{kind:'task-edit',targetId:id,changes:{estimate_minutes:180}}]}};
 expect(()=>buildHorizonPreview(draft,input,{...context,tasks})).toThrow('Task does not fit');
 expect(buildHorizonPreview({...draft,events:[{...event('2026-11-02','10:00','13:00'),taskId:id}]},input,{...context,tasks}).events).toHaveLength(1);
});
