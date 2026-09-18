import {expect,it} from 'vitest';
import {occupiedIntervals,type PlannerEvent} from '@/lib/calendar/planner-intervals';
const event=(changes:Partial<PlannerEvent>):PlannerEvent=>({id:'event',user_id:'owner',title:'Commitment',description:null,location:null,color:null,category_id:null,start_date:'2026-03-01',end_date:'2026-03-01',start_time:'09:00',end_time:'10:00',is_recurring:false,recurrence_rule:null,end_type:null,end_date_recurrence:null,end_count:null,recurring_event_id:null,original_date:null,is_exception:false,created_at:'',updated_at:'',timezone:'UTC',...changes});
const read=(events:PlannerEvent[],start:string,end:string)=>occupiedIntervals(events,Date.parse(start),Date.parse(end),'UTC');
it('preserves an edited exception instead of the recurring original',()=>{
 const parent=event({id:'series',is_recurring:true,recurrence_rule:{frequency:'daily',interval:1}});
 const exception=event({id:'edited',is_exception:true,recurring_event_id:'series',original_date:'2026-03-02',start_date:'2026-03-02',end_date:'2026-03-02',start_time:'11:00',end_time:'12:00'});
 expect(read([parent,exception],'2026-03-02T08:00:00Z','2026-03-02T13:00:00Z')).toEqual([{id:'edited',title:'Commitment',start:Date.parse('2026-03-02T11:00:00Z'),end:Date.parse('2026-03-02T12:00:00Z')}]);
});
it('honors count/date ends and reserves all-day and cross-midnight commitments',()=>{
 const parent=event({is_recurring:true,recurrence_rule:{frequency:'daily',interval:1},end_type:'after_count',end_count:1});
 expect(read([parent],'2026-03-02T08:00:00Z','2026-03-02T13:00:00Z')).toEqual([]);
 expect(read([{...parent,end_type:'on_date',end_date_recurrence:'2026-03-01'}],'2026-03-02T08:00:00Z','2026-03-02T13:00:00Z')).toEqual([]);
 expect(read([event({start_time:null,end_time:null})],'2026-03-01T12:00:00Z','2026-03-01T13:00:00Z')[0].end).toBe(Date.parse('2026-03-02T00:00:00Z'));
 expect(read([event({start_time:'23:30',end_time:'00:30',end_date:'2026-03-02'})],'2026-03-02T00:00:00Z','2026-03-02T01:00:00Z')[0].start).toBe(Date.parse('2026-03-01T23:30:00Z'));
});
it('ignores a nonexistent spring-gap occurrence on a different local day',()=>{
 const parent=event({is_recurring:true,recurrence_rule:{frequency:'daily',interval:1},timezone:'America/Los_Angeles',start_time:'02:30',end_time:'03:30'});
 expect(read([parent],'2026-03-09T09:00:00Z','2026-03-09T11:00:00Z')).toEqual([{id:'event_2026-03-09',title:'Commitment',start:Date.parse('2026-03-09T09:30:00Z'),end:Date.parse('2026-03-09T10:30:00Z')}]);
});
