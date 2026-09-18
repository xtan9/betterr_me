import type {CalendarEvent} from '@/lib/db/types';
import {addLocalDays,daysBetween,getOccurrencesInRange,isValidLocalDate,getLocalDateInTimeZone} from '@/lib/recurring-tasks/scheduling';
export type PlannerEvent=Pick<CalendarEvent,'id'|'title'|'start_date'|'end_date'|'start_time'|'end_time'|'is_recurring'>&Partial<Omit<CalendarEvent,'id'|'title'|'start_date'|'end_date'|'start_time'|'end_time'|'is_recurring'>>&{timezone?:string|null;session_ended_at?:string|null;routine_occurrence_id?:string|null;app_owned?:boolean;is_protected?:boolean};
/** Same wall-clock policy as calendar commands: reject gaps, choose the later fold. */
export function wallInstant(date:string,time:string,timezone:string):number{
 if(!isValidLocalDate(date)||!/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(time))throw new Error('Invalid wall time');
 const wall=Date.parse(`${date}T${time.length===5?time+':00':time}Z`);
 const formatter=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
 const civil=(instant:number)=>{const p=Object.fromEntries(formatter.formatToParts(new Date(instant)).map(part=>[part.type,part.value]));return Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`);};
 const valid=[-36,0,36].map(hours=>{const probe=wall+hours*3600000;return wall-(civil(probe)-probe);}).filter(instant=>civil(instant)===wall);
 if(!valid.length)throw new Error('Nonexistent wall time');return Math.max(...valid);
}
/** Read-only expansion, including exceptions and cross-midnight reservations. */
export function occupiedIntervals(events:PlannerEvent[],start:number,end:number,timezone:string){
 const first=new Date(start).toISOString().slice(0,10),last=new Date(end).toISOString().slice(0,10),expanded:PlannerEvent[]=[];
 for(const event of events){
  if(event.start_date>addLocalDays(last,2)||!event.is_recurring&&event.end_date<addLocalDays(first,-2))continue;
  if(!event.is_recurring){expanded.push(event);continue;}
  if(!event.recurrence_rule)throw new Error('Incomplete recurrence');
  const duration=daysBetween(event.start_date,event.end_date),from=addLocalDays(first,-duration-2),to=addLocalDays(last,2);
  const until=event.end_type==='on_date'&&event.end_date_recurrence&&event.end_date_recurrence<to?event.end_date_recurrence:to;
  const dates=getOccurrencesInRange(event.recurrence_rule,event.start_date,event.end_type==='after_count'?event.start_date:from,until);
  const limited=event.end_type==='after_count'?dates.slice(0,event.end_count??0):dates;
  for(const day of limited){if(day<from||events.some(exception=>exception.is_exception&&exception.recurring_event_id===event.id&&exception.original_date===day))continue;
   expanded.push({...event,id:`${event.id}_${day}`,start_date:day,end_date:addLocalDays(day,duration)});
  }
 }
 return expanded.filter(event=>{const zone=event.timezone||timezone;return event.end_date>=getLocalDateInTimeZone(new Date(start),zone)&&event.start_date<=getLocalDateInTimeZone(new Date(end),zone);}).map(event=>{const zone=event.timezone||timezone,eventStart=wallInstant(event.start_date,event.start_time??'00:00',zone),eventEnd=event.session_ended_at?Date.parse(event.session_ended_at):wallInstant(event.start_time===null?addLocalDays(event.end_date,1):event.end_date,event.end_time??'00:00',zone);
  if(!Number.isFinite(eventEnd)||eventEnd<eventStart||eventEnd===eventStart&&!event.session_ended_at)throw new Error('Invalid calendar interval');
  return {id:event.id,title:event.title,start:eventStart,end:eventEnd};
 }).filter(event=>event.start<end&&event.end>start).sort((a,b)=>a.start-b.start);
}

