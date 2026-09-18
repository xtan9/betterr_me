import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {buildCapturePreview,captureOutput,type CaptureContext} from './native-capture';
import {occupiedIntervals,wallInstant,type PlannerEvent} from '@/lib/calendar/planner-intervals';
import {addLocalDays,isValidLocalDate} from '@/lib/recurring-tasks/scheduling';
const clock=z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const planningRequest=z.object({requestId:z.string().uuid(),consent:z.literal(true),locale:z.enum(['en','zh']),date:z.string().refine(isValidLocalDate),timezone:z.string().min(1).max(100),commitments:z.string().max(2000),needs:z.string().max(2000),goals:z.string().max(2000),travelMinutes:z.number().int().min(1).max(1440).nullable()}).strict();
export const planningOutput=z.object({message:z.string().max(4000),questions:z.array(z.string().max(500)).max(10),assumptions:z.array(z.string().max(500)).max(10),capture:captureOutput,events:z.array(z.object({kind:z.enum(['event-create','event-edit','event-remove']),targetId:z.string().uuid().nullable(),title:z.string().min(1).max(100),startTime:clock,endTime:z.union([clock,z.literal('24:00')]),taskId:z.string().uuid().nullable(),taskItemIndex:z.number().int().min(0).max(9).nullable(),protected:z.boolean(),category:z.enum(['work','sleep','preparation','travel','meal','care','rest','other'])}).strict()).max(20),priorityTaskIds:z.array(z.string().uuid()).max(20).nullable()}).strict();
export type PlanningContext={version:string;timezone:string;tasks:(CaptureContext['tasks'][number]&{recurring_series_id?:string|null})[];events:PlannerEvent[];priorities:{version:string|null;taskIds:string[]}};
export function buildSchedulePreview(value:unknown,input:z.infer<typeof planningRequest>,context:PlanningContext){
 const output=planningOutput.parse(value),start=wallInstant(input.date,'00:00',input.timezone),end=wallInstant(addLocalDays(input.date,1),'00:00',input.timezone);
 const clarify=(questions:string[])=>({date:input.date,timezone:input.timezone,contextVersion:context.version,message:output.message,questions,assumptions:output.assumptions,freeTime:[],capture:{message:'',items:[]},events:[],priorities:null});
 if(output.questions.length)return clarify(output.questions);
 if(output.events.some(event=>event.category==='travel')&&input.travelMinutes===null)return clarify([input.locale==='zh'?'旅途需要多少分钟？':'How many minutes are needed for travel?']);
 const capture=buildCapturePreview(output.capture,{timezone:input.timezone,tasks:context.tasks,projects:[]});
 for(const item of capture.items){
  if(item.kind.startsWith('project')||item.kind==='task-edit'&&context.tasks.find(task=>task.id===item.targetId)?.recurring_series_id)throw new Error('Unsupported capture');
  if(item.kind==='routine-create'&&(item.changes.date!==input.date||item.changes.timezone!==input.timezone))throw new Error('Routine outside horizon');
 }
 const changed=new Set<string>();
 const events=output.events.map(action=>{
  const before=action.targetId?context.events.find(event=>event.id===action.targetId):undefined;
  if(action.kind!=='event-create'){
   if(!before||!before.app_owned||before.is_protected||before.is_recurring||before.is_exception||before.recurring_event_id||before.routine_occurrence_id||before.session_ended_at||changed.has(before.id))throw new Error('Unsupported event edit');changed.add(before.id);
  }else if(action.targetId)throw new Error('Unexpected target');
  if(action.taskId&&!context.tasks.some(task=>task.id===action.taskId)||action.taskId&&action.taskItemIndex!==null)throw new Error('Unknown task');
  const taskItem=action.taskItemIndex===null?null:capture.items[action.taskItemIndex];
  if(action.taskItemIndex!==null&&taskItem?.kind!=='task-create')throw new Error('Unknown captured task');
  const endDate=action.endTime==='24:00'?addLocalDays(input.date,1):input.date,endTime=action.endTime==='24:00'?'00:00':action.endTime;
  const a=wallInstant(input.date,action.startTime,input.timezone),b=wallInstant(endDate,endTime,input.timezone);
  if(action.kind!=='event-remove'&&(b<=a||action.category==='travel'&&(b-a)/60000!==input.travelMinutes))throw new Error('Invalid duration');
  return {id:randomUUID(),kind:action.kind,...(before?{targetId:before.id,expectedVersion:before.version,before}:{}),...(taskItem?{taskItemId:taskItem.id}:{}),category:action.category,changes:action.kind==='event-remove'?{}:{title:action.title,start_date:input.date,end_date:endDate,start_time:action.startTime,end_time:endTime,timezone:input.timezone,task_id:action.taskId,is_protected:action.protected}};
 });
 const proposed=events.filter(event=>event.kind!=='event-remove').map(event=>({...event.changes,id:event.id,is_recurring:false,is_exception:false,recurrence_rule:null,session_ended_at:null}) as PlannerEvent);
 for(const item of capture.items)if(item.kind==='routine-create')proposed.push({id:item.id,title:item.changes.title,start_date:input.date,end_date:input.date,start_time:item.changes.startTime,end_time:item.changes.endTime,timezone:input.timezone,is_recurring:false} as PlannerEvent);
 const occupied=occupiedIntervals([...context.events.filter(event=>!changed.has(event.id)),...proposed],start,end,input.timezone),newIds=new Set(proposed.map(event=>event.id));
 for(let i=0;i<occupied.length;i++)for(let j=i+1;j<occupied.length&&occupied[j].start<occupied[i].end;j++)if(newIds.has(occupied[i].id)||newIds.has(occupied[j].id))throw new Error('Proposed overlap');
 const freeTime:{start:string;end:string}[]=[];let cursor=start;
 for(const interval of occupied){if(interval.start>cursor)freeTime.push({start:new Date(cursor).toISOString(),end:new Date(Math.min(end,interval.start)).toISOString()});cursor=Math.max(cursor,interval.end);}
 if(cursor<end)freeTime.push({start:new Date(cursor).toISOString(),end:new Date(end).toISOString()});
 if(output.priorityTaskIds?.some(id=>!context.tasks.some(task=>task.id===id))||output.priorityTaskIds&&new Set(output.priorityTaskIds).size!==output.priorityTaskIds.length)throw new Error('Unknown priority');
 return {date:input.date,timezone:input.timezone,contextVersion:context.version,message:output.message,questions:[],assumptions:output.assumptions,freeTime,capture,events,priorities:output.priorityTaskIds?{taskIds:output.priorityTaskIds,expectedVersion:context.priorities.version}:null};
}
