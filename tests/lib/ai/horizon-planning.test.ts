import {expect,it} from 'vitest';
import {buildHorizonPreview,horizonPlanningRequest,horizonContext} from '@/lib/ai/horizon-planning';
import type {PlanningContext} from '@/lib/ai/guided-planning';
const id='61500000-0000-0000-0000-000000000003';
const context:PlanningContext={version:id,timezone:'America/Los_Angeles',tasks:[],events:[],priorities:{version:null,taskIds:[]}};
const input={requestId:id,consent:true as const,locale:'en' as const,horizon:{startDate:'2026-10-30',endDate:'2026-11-02',timezone:'America/Los_Angeles'},commitments:'Family after 15:00, weekends family',needs:'',goals:'',travelMinutes:null};
const event=(date:string,startTime='10:00',endTime='11:00')=>({date,startTime,endTime,kind:'event-create',targetId:null,title:'Focus',taskId:null,taskItemIndex:null,protected:false,category:'work'});
const output=(events:unknown[])=>({message:'Review the dates',questions:[],assumptions:[],capture:{message:'',actions:[]},events,priorityTaskIds:null});
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
