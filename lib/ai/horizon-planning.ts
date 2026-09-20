import {z} from 'zod';
import {horizonSchema,planningCalendarContext,assertPublicAssistantText} from './assistant-orchestrator';
import {planningRequest,planningOutput,buildSchedulePreview,type PlanningContext} from './guided-planning';
import {buildCapturePreview} from './native-capture';
import {addLocalDays,isValidLocalDate} from '@/lib/recurring-tasks/scheduling';

export const horizonPlanningRequest=planningRequest.omit({date:true,timezone:true}).extend({horizon:horizonSchema,commitments:z.string().max(12000),needs:z.string().max(6000)}).strict();
export const sessionPlanningRequest=z.object({requestId:z.string().uuid(),consent:z.literal(true),locale:z.enum(['en','zh']),sessionId:z.string().uuid(),sessionVersion:z.string().uuid()}).strict();
export const horizonPlanningOutput=planningOutput.extend({
 questions:planningOutput.shape.questions.max(3),
 events:z.array(planningOutput.shape.events.element.extend({date:z.string().refine(isValidLocalDate)})).max(200),
 // Daily priorities and unbounded new recurrences are not implied by a dated draft.
 priorityTaskIds:z.null(),
}).strict();
export type HorizonPlanningInput=z.infer<typeof horizonPlanningRequest>;
export function horizonDays(horizon:z.infer<typeof horizonSchema>){
 const range=horizonSchema.parse(horizon),days:string[]=[];
 for(let date=range.startDate;date<=range.endDate;date=addLocalDays(date,1))days.push(date);
 return days;
}
export function horizonContext(context:PlanningContext,horizon:z.infer<typeof horizonSchema>){
 return {horizon,days:horizonDays(horizon).map(date=>({date,weekday:new Intl.DateTimeFormat('en',{weekday:'long',timeZone:'UTC'}).format(new Date(`${date}T12:00:00Z`))})),occupied:planningCalendarContext(context.events,horizon)};
}
/** Validate every civil day, then return ONE envelope for the existing transaction. */
export function buildHorizonPreview(value:unknown,input:HorizonPlanningInput,context:PlanningContext){
 const output=horizonPlanningOutput.parse(value),days=horizonDays(input.horizon);
 for(const text of [output.message,...output.questions,...output.assumptions])assertPublicAssistantText(text);
 const base={date:input.horizon.startDate,timezone:input.horizon.timezone,horizon:input.horizon,contextVersion:context.version,message:output.message,questions:output.questions,assumptions:output.assumptions,freeTime:[] as {start:string;end:string}[],capture:{message:output.message,items:[] as ReturnType<typeof buildCapturePreview>['items']},events:[] as ReturnType<typeof buildSchedulePreview>['events'][number][],priorities:null};
 if(output.questions.length)return base;
 if(output.events.some(event=>event.category==='travel')&&input.travelMinutes===null)return {...base,questions:[input.locale==='zh'?'旅途需要多少分钟？':'How many minutes are needed for travel?']};
 const targets=new Set<string>();
 for(const event of output.events){
  if(!days.includes(event.date))throw new Error('Event outside horizon');
  if(event.targetId){
   if(targets.has(event.targetId))throw new Error('Duplicate event target');
   targets.add(event.targetId);
   const before=context.events.find(item=>item.id===event.targetId);
   if(!before||before.start_date<input.horizon.startDate||before.end_date>input.horizon.endDate)throw new Error('Target outside horizon');
  }
 }
 base.capture=buildCapturePreview(output.capture,{timezone:input.horizon.timezone,tasks:context.tasks,projects:[]});
 if(base.capture.items.some(item=>!['task-create','task-edit'].includes(item.kind)||item.kind==='task-edit'&&context.tasks.find(task=>task.id===item.targetId)?.recurring_series_id))throw new Error('Unsupported horizon capture');
 for(const date of days){
  const actions=output.events.filter(event=>event.date===date);
  // Remove all replaced originals from occupancy, including a move to another day.
  // Keep this day's targets available for the existing immutable-before validation.
  const localContext={...context,events:context.events.filter(event=>!targets.has(event.id)||actions.some(action=>action.targetId===event.id))};
  const daily=buildSchedulePreview({...output,capture:{message:'',actions:[]},events:actions.map(({date:_,taskItemIndex:_taskItemIndex,...event})=>({...event,taskItemIndex:null}))}, {...input,date,timezone:input.horizon.timezone},localContext);
  daily.events.forEach((event,index)=>{
   const action=actions[index];
   if(action.taskItemIndex!==null){
    const item=base.capture.items[action.taskItemIndex];
    if(action.taskId||item?.kind!=='task-create')throw new Error('Unknown captured task');
    event.taskItemId=item.id;
   }
  });
  base.events.push(...daily.events);base.freeTime.push(...daily.freeTime);
 }
 return base;
}
