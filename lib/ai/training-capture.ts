import {z} from 'zod';
import type {SupabaseClient} from '@supabase/supabase-js';
import {exerciseVersionSchema} from '@/lib/validations/train-exercises';
import {templateListSchema} from '@/lib/validations/train-templates';
import {getLocalDateInTimeZone,isValidLocalDate} from '@/lib/recurring-tasks/scheduling';
import {CaptureScheduleError,deviceTimezone,resolveTaskSchedule,type TimedTaskSchedule} from './timed-capture';

const clock=z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const trainingCaptureChanges=z.object({
 title:z.string().trim().min(1).max(100),date:z.string().refine(isValidLocalDate),timezone:deviceTimezone,
 trainingTemplateId:z.string().uuid().nullable(),trainingTemplateVersion:exerciseVersionSchema.optional(),trainingTemplateName:z.string().optional(),
 startTime:clock.optional(),endTime:clock.optional(),protected:z.boolean().optional(),
}).strict().superRefine((value,context)=>{
 if(!!value.startTime!==!!value.endTime||value.startTime&&value.endTime&&value.endTime<=value.startTime||!!value.trainingTemplateId!==!!value.trainingTemplateVersion||!!value.trainingTemplateId!==!!value.trainingTemplateName
  ||!value.startTime&&value.protected!==undefined)context.addIssue({code:'custom',message:'Incomplete training plan'});
});
export const trainingRevisionChanges=z.object({
 title:z.string().trim().min(1).max(100),date:z.string().refine(isValidLocalDate),timezone:deviceTimezone,
 trainingTemplateId:z.string().uuid().nullable(),startTime:clock.nullable().optional(),endTime:clock.nullable().optional(),
}).strict().refine(value=>(value.startTime===undefined)===(value.endTime===undefined)&&(value.startTime===null)===(value.endTime===null)
 &&(!value.startTime||!!value.endTime&&value.endTime>value.startTime),'Provide a same-day interval or clear both times');
export const trainingCaptureAction=z.object({
 kind:z.literal('training-create'),title:z.string().trim().min(1).max(100),
 date:z.string().refine(isValidLocalDate),timezone:deviceTimezone,templateId:z.string().uuid().nullable(),
 startTime:clock.nullable(),endTime:clock.nullable(),
}).strict();
export type TrainingTemplateSummary={id:string;name:string;version:string};
export async function trainingTemplateContext(client:SupabaseClient,ownerId:string){
 const unavailable={trainingTemplatesAvailable:false,trainingTemplates:[]};
 const trainingTemplates:TrainingTemplateSummary[]=[];
 let after:string|null=null;
 try{
  // The Train DTO serializes bigint versions as exact decimal strings.
  // Bound model context to two pages, without claiming a complete library.
  for(let page=0;page<2;page++){
   const {data,error}=await client.rpc('read_train_templates',{p_id:null,p_after:after});
   if(error||data?.status!=='available')return unavailable;
   const {status:_status,...payload}=data;
   const parsed=templateListSchema.safeParse(payload);
   if(!parsed.success||parsed.data.templates.some(row=>row.template.ownerId!==ownerId)
    ||after!==null&&parsed.data.nextCursor!==null&&parsed.data.nextCursor<=after)return unavailable;
   trainingTemplates.push(...parsed.data.templates.filter(row=>row.template.archivedAt===null&&row.startability.ready&&row.template.name.trim()).map(({template})=>({id:template.id,name:template.name,version:template.version})));
   after=parsed.data.nextCursor;if(after===null)break;
  }
  return {trainingTemplatesAvailable:true,trainingTemplates};
 }catch{return unavailable;}
}
type TrainingContext={supportsTrainingPlans?:boolean;trainingTemplates?:TrainingTemplateSummary[];trainingTemplatesAvailable?:boolean;referenceAt?:number};
type TrainingFailure='unsupported'|'date'|'duration'|'interval'|'template'|'past'|'ambiguous'|'nonexistent';
export class TrainingCaptureError extends Error {
 constructor(readonly reason:TrainingFailure){super('Training plan needs clarification');}
}
export function trainingSchedule(changes:{date:string;timezone:string;startTime?:string|null;endTime?:string|null},referenceAt=Date.now()):TimedTaskSchedule|null{
 if(!changes.startTime&&!changes.endTime)return null;
 if(!changes.startTime||!changes.endTime)throw new TrainingCaptureError('duration');
 if(changes.endTime<=changes.startTime)throw new TrainingCaptureError('interval');
 try{
  return resolveTaskSchedule({startDate:changes.date,startTime:changes.startTime,endDate:changes.date,endTime:changes.endTime,timezone:changes.timezone,durationMinutes:null,pastConfirmed:false},null,{timezone:changes.timezone,supportsTimedTasks:true,referenceAt});
 }catch(error){
  if(error instanceof CaptureScheduleError&&['past','ambiguous','nonexistent','duration'].includes(error.reason))throw new TrainingCaptureError(error.reason as TrainingFailure);
  throw error;
 }
}
export function resolveTrainingCapture(action:z.infer<typeof trainingCaptureAction>,context:TrainingContext){
 if(!context.supportsTrainingPlans)throw new TrainingCaptureError('unsupported');
 const referenceAt=context.referenceAt??Date.now();
 if(action.date<getLocalDateInTimeZone(new Date(referenceAt),action.timezone))throw new TrainingCaptureError('date');
 const template=action.templateId?context.trainingTemplates?.find(row=>row.id===action.templateId):undefined;
 if(action.templateId&&!template)throw new TrainingCaptureError('template');
 const schedule=trainingSchedule(action,referenceAt);
 return {title:action.title,date:action.date,timezone:action.timezone,trainingTemplateId:action.templateId,
  ...(template?{trainingTemplateName:template.name,trainingTemplateVersion:template.version}:{}),
  ...(schedule?{startTime:schedule.startTime,endTime:schedule.endTime,protected:true}:{}),
 };
}
export function trainingCaptureQuestion(reason:TrainingFailure,locale:'en'|'zh'){
 const messages={
  unsupported:['Please update the app to preview and confirm a training plan.','请更新应用后预览和确认训练计划。'],
  date:['That training date has passed. Which day should I plan it for?','这个训练日期已经过去了，你想安排在哪一天？'],
  past:['That training time has passed. What time should I use?','这个训练时间已经过去了，你想改到几点？'],
  duration:['What end time or duration should I use for this training?','这次训练要安排到几点，或持续多久？'],
  interval:['What later end time on the same day should I use for this training?','这次训练需要晚于开始时间的当天结束时间，要安排到几点？'],
  template:['I cannot verify that training template. Use no template for now, or choose another?','我暂时无法确认这个训练模板。要先不选模板，还是换一个？'],
  ambiguous:['That training time occurs twice because the clocks change. What other time should I use?','夏令时切换会让这个训练时间出现两次，请选择另一个时间。'],
  nonexistent:['That training time does not exist because the clocks change. What other time should I use?','夏令时切换会跳过这个训练时间，请选择另一个时间。'],
 };
 return messages[reason][locale==='zh'?1:0];
}

/** Older apps can keep chat text without receiving an action they cannot review. */
export function hasTrainingCapture(proposal:unknown):boolean{
 const parsed=z.object({body:z.object({items:z.array(z.object({kind:z.string()}).passthrough())}).passthrough()}).passthrough().safeParse(proposal);
 return parsed.success&&parsed.data.body.items.some(item=>item.kind==='training-create');
}
