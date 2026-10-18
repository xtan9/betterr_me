import {z} from 'zod';
import {getLocalDateInTimeZone,isValidLocalDate} from '@/lib/recurring-tasks/scheduling';
import {occupiedIntervals,wallInstant,type PlannerEvent} from '@/lib/calendar/planner-intervals';

const civilDate=z.string().refine(isValidLocalDate,'Invalid civil date');
const clock=z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const deviceTimezone=z.string().min(1).max(100).refine(value=>{
 try{new Intl.DateTimeFormat('en',{timeZone:value});return true;}catch{return false;}
},'Invalid time zone');
export const timedTaskInput=z.object({
 startDate:civilDate,startTime:clock,
 timezone:deviceTimezone.nullable(),endDate:civilDate.nullable(),endTime:clock.nullable(),
 durationMinutes:z.number().int().min(1).max(10080).nullable(),
 pastConfirmed:z.boolean().describe('True only after the user explicitly confirms the exact past time following a clarification; never infer confirmation from the initial request.'),
}).strict();
export type TimedTaskSchedule={startDate:string;startTime:string;endDate:string;endTime:string;timezone:string;durationSource:'explicit'|'estimate'|'default'};
type ScheduleFailure='unsupported'|'past'|'ambiguous'|'nonexistent'|'duration'|'overlap'|'recurring';
export class CaptureScheduleError extends Error {
 constructor(readonly reason:ScheduleFailure){super('Task time requires clarification');}
}
function localTime(instant:number,timezone:string){
 return new Intl.DateTimeFormat('en-GB',{timeZone:timezone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(instant));
}
/** Exact reservations cannot silently choose either occurrence of a repeated local time. */
function unambiguousInstant(date:string,time:string,timezone:string){
 let instant:number;
 try{instant=wallInstant(date,time,timezone);}catch{throw new CaptureScheduleError('nonexistent');}
 const wall=Date.parse(`${date}T${time}:00Z`);
 const formatter=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
 const civil=(value:number)=>{const parts=Object.fromEntries(formatter.formatToParts(new Date(value)).map(part=>[part.type,part.value]));return Date.parse(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`);};
 const candidates=new Set([-36,0,36].map(hours=>{const probe=wall+hours*3600000;return wall-(civil(probe)-probe);}).filter(value=>civil(value)===wall));
 if(candidates.size>1)throw new CaptureScheduleError('ambiguous');
 return instant;
}
export function resolveTaskSchedule(input:z.infer<typeof timedTaskInput>,estimate:number|null,context:{timezone:string;referenceAt?:number;supportsTimedTasks?:boolean;pastTimeConfirmed?:boolean}):TimedTaskSchedule{
 if(!context.supportsTimedTasks)throw new CaptureScheduleError('unsupported');
 const timezone=input.timezone??context.timezone;
 const start=unambiguousInstant(input.startDate,input.startTime,timezone);
 if(start<(context.referenceAt??Date.now())&&!(input.pastConfirmed&&context.pastTimeConfirmed))throw new CaptureScheduleError('past');
 if(input.endDate&&!input.endTime)throw new CaptureScheduleError('duration');
 const explicitEnd=input.endTime!==null;
 const durationSource=explicitEnd||input.durationMinutes!==null?'explicit':estimate!==null?'estimate':'default';
 const minutes=input.durationMinutes??estimate??30;
 const end=explicitEnd?unambiguousInstant(input.endDate??input.startDate,input.endTime!,timezone):start+minutes*60000;
 if(end<=start||end-start>10080*60000)throw new CaptureScheduleError('duration');
 const endDate=getLocalDateInTimeZone(new Date(end),timezone),endTime=localTime(end,timezone);
 if(unambiguousInstant(endDate,endTime,timezone)!==end)throw new CaptureScheduleError('ambiguous');
 return {startDate:input.startDate,startTime:input.startTime,endDate,endTime,timezone,durationSource};
}
export function assertTaskSchedulesAvailable(schedules:TimedTaskSchedule[],events:PlannerEvent[]){
 const intervals=schedules.map(schedule=>({start:wallInstant(schedule.startDate,schedule.startTime,schedule.timezone),end:wallInstant(schedule.endDate,schedule.endTime,schedule.timezone)}));
 for(let index=0;index<intervals.length;index++){
  const interval=intervals[index];
  if(occupiedIntervals(events,interval.start,interval.end,schedules[index].timezone).length||intervals.slice(0,index).some(other=>other.start<interval.end&&other.end>interval.start))throw new CaptureScheduleError('overlap');
 }
}
export function taskScheduleQuestion(reason:ScheduleFailure,locale:'en'|'zh'){
 const messages={
  unsupported:['Please update the app to preview and confirm a task with a scheduled time. Nothing has been created.','请更新应用后预览和确认带时间的任务。目前尚未创建任务或时间段。'],
  past:['That time has already passed. Do you still want to schedule this task at that exact past time?','这个时间已经过去了，仍要把任务安排在这个过去的时间吗？'],
  ambiguous:['That local time occurs twice because the clocks change. Which different, unambiguous time should I use?','夏令时切换会让这个本地时间出现两次，请换一个没有歧义的时间。'],
  nonexistent:['That local time does not exist because the clocks change. What other time should I use?','夏令时切换会跳过这个本地时间，请选择另一个时间。'],
  duration:['What end time or duration should I use for this task?','这个任务要安排到几点，或持续多久？'],
  overlap:['That time overlaps an existing commitment or another proposed task. Which time or duration would you like to change?','这个时间与已有安排或另一个拟议任务冲突。你想调整哪个时间或时长？'],
  recurring:['Please handle the repeating routine separately from this one-time task reservation. Which should we arrange first?','请把重复安排与这次单独的任务时间分开处理。你想先安排哪一项？'],
 };
 return messages[reason][locale==='zh'?1:0];
}
export function confirmsPastTaskTime(messages:{role:string;content:string}[]){
 const prior=messages.slice(0,-1).reverse().find(message=>message.role==='assistant');
 return !!prior&&(['en','zh'] as const).some(locale=>prior.content.includes(taskScheduleQuestion('past',locale)))&&/^(?:yes\b|confirm\b|keep\b|是|确认|仍然|仍要|就按|好的|好[，。！!\s]*$)/iu.test(messages.at(-1)?.content.trim()??'');
}
