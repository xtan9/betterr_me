import type {SupabaseClient} from '@supabase/supabase-js';
import {getLocalDateInTimeZone,addLocalDays} from '@/lib/recurring-tasks/scheduling';
import {occupiedIntervals,type PlannerEvent} from '@/lib/calendar/planner-intervals';
import { googlePlanningEvents } from '@/lib/google/planning';
export type RecommendationTask={id:string;title:string;version:string;estimate_minutes:number|null;facts:{actionable:boolean;reasons:string[];fitsGap:boolean|null}};
async function rows<T>(client:SupabaseClient,table:string,userId:string,columns='*'):Promise<T[]>{
 const all:T[]=[];for(let offset=0;;offset+=500){const {data,error}=await client.from(table).select(columns).eq('user_id',userId).order(table==='planner_routine_schedules'?'series_id':'id').range(offset,offset+499);if(error||!data)throw new Error('Unavailable context');all.push(...data as T[]);if(data.length<500)return all;}
}
export async function nextActionFacts(client:SupabaseClient,userId:string,start:number,end:number){
 const profile=await client.from('profiles').select('timezone').eq('id',userId).single();if(profile.error)throw new Error('Unavailable profile');
 const timezone=profile.data?.timezone||'UTC',date=getLocalDateInTimeZone(new Date(start),timezone),endDate=getLocalDateInTimeZone(new Date(end),timezone);
 const [queue,priorities,events,taskMetadata,series,schedules]=await Promise.all([
  client.rpc('action_queue_snapshot',{p_at:new Date(start).toISOString(),p_gap_minutes:Math.floor((end-start)/60000)}),client.rpc('priority_snapshot',{p_date:date}),
  rows<PlannerEvent>(client,'calendar_events',userId),
  rows<{id:string;due_date:string|null;recurring_series_id:string|null;recurring_occurrence_id:string|null;scheduled_date:string|null;is_completed:boolean;recurrence_occurrence_state:string|null}>(client,'tasks',userId,'id,due_date,recurring_series_id,recurring_occurrence_id,scheduled_date,is_completed,recurrence_occurrence_state'),
  rows<{id:string;status:string;activation_date:string;coverage_horizon:string|null;last_scheduled_date:string|null;time_zone:string}>(client,'recurring_task_series',userId),
  rows<{series_id:string}>(client,'planner_routine_schedules',userId,'series_id'),
 ]);
 if(queue.error||priorities.error||!Array.isArray(queue.data?.tasks)||!Array.isArray(queue.data?.queue)||!Array.isArray(priorities.data?.taskIds))throw new Error('Unavailable actionability');
 // Recommendation is read-only: missing occurrence coverage must be resolved in the manual Calendar first.
 for(const row of series){const through=getLocalDateInTimeZone(new Date(end),row.time_zone);if(row.status==='active'&&row.activation_date<=through&&(!row.coverage_horizon||row.coverage_horizon<(row.last_scheduled_date&&row.last_scheduled_date<through?row.last_scheduled_date:through)))throw new Error('Incomplete occurrence coverage');}
 for(const task of taskMetadata)if(task.scheduled_date&&task.scheduled_date>=addLocalDays(date,-2)&&task.scheduled_date<=addLocalDays(endDate,2)&&!task.is_completed&&!['skipped','withdrawn','completed'].includes(task.recurrence_occurrence_state??'')&&schedules.some(row=>row.series_id===task.recurring_series_id)&&!events.some(event=>event.routine_occurrence_id===task.recurring_occurrence_id))throw new Error('Incomplete routine calendar');
 const external = await googlePlanningEvents(userId,start,end,timezone);
 const occupied=occupiedIntervals([...events,...external],start,end,timezone),availableUntil=occupied.length?Math.max(start,occupied[0].start):end,gapMinutes=Math.floor((availableUntil-start)/60000);
 const tasks=queue.data.tasks as RecommendationTask[],byId=new Map(tasks.map(task=>[task.id,task])),dueById=new Map(taskMetadata.map(task=>[task.id,task.due_date]));
 const remaining=[...tasks].sort((a,b)=>(dueById.get(a.id)??'9999').localeCompare(dueById.get(b.id)??'9999')||a.id.localeCompare(b.id));
 const order=[...new Set<string>([...priorities.data.taskIds,...queue.data.queue,...remaining.map(task=>task.id)])];
 const skipped:{id:string;title:string;reasons:string[]}[]=[];let selected:(RecommendationTask&{due_date:string|null;source:'priority'|'queue'|'other'})|null=null;
 for(const id of order){const task=byId.get(id);if(!task)continue;const reasons=[...task.facts.reasons];
  if(task.estimate_minutes===null&&!reasons.includes('estimate-unknown'))reasons.push('estimate-unknown');
  if(gapMinutes<=0)reasons.push('occupied');else if(task.estimate_minutes!==null&&task.estimate_minutes>gapMinutes&&!reasons.includes('gap-too-short'))reasons.push('gap-too-short');
  if(reasons.length||!task.facts.actionable){skipped.push({id,title:task.title,reasons:reasons.length?reasons:['unavailable']});continue;}
  if(!selected)selected={...task,due_date:dueById.get(id)??null,source:priorities.data.taskIds.includes(id)?'priority':queue.data.queue.includes(id)?'queue':'other'};
 }
 return {selected,skipped,occupied,window:{start:new Date(start).toISOString(),end:new Date(end).toISOString(),availableUntil:new Date(availableUntil).toISOString(),gapMinutes,timezone},generatedAt:new Date().toISOString()};
}


