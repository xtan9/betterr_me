import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {isValidLocalDate} from '@/lib/recurring-tasks/scheduling';
const civilDate=z.string().refine(isValidLocalDate,'Invalid civil date');
const taskFields=z.object({title:z.string().trim().min(1).max(100).optional(),estimate_minutes:z.number().int().min(1).max(2147483647).nullable().optional(),due_date:civilDate.nullable().optional()}).strict();
export const captureOutput=z.object({message:z.string().max(8000),actions:z.array(z.discriminatedUnion('kind',[
 z.object({kind:z.literal('task-create'),title:z.string().trim().min(1).max(100),estimateMinutes:z.number().int().min(1).max(2147483647).nullable(),dueDate:civilDate.nullable(),projectId:z.string().uuid().nullable(),projectKey:z.string().max(80).nullable()}).strict(),
 z.object({kind:z.literal('task-edit'),targetId:z.string().uuid(),changes:taskFields}).strict(),
 z.object({kind:z.literal('project-create'),key:z.string().min(1).max(80),name:z.string().trim().min(1).max(50)}).strict(),
 z.object({kind:z.literal('project-edit'),targetId:z.string().uuid(),name:z.string().trim().min(1).max(50)}).strict(),
 z.object({kind:z.literal('routine-create'),title:z.string().trim().min(1).max(100),date:civilDate,startTime:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),endTime:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),timezone:z.string().min(1).max(100),protected:z.boolean(),frequency:z.enum(['daily','weekly']),daysOfWeek:z.array(z.number().int().min(0).max(6)).max(7)}).strict(),
])).max(10)}).strict();
export type CaptureContext={timezone:string;tasks:{id:string;title:string;version:string;estimate_minutes:number|null;due_date:string|null;project_id:string|null}[];projects:{id:string;name:string;version:string}[]};
export function buildCapturePreview(output:unknown,context:CaptureContext){
 const parsed=captureOutput.parse(output),projectKeys=new Map<string,string>(),edited=new Set<string>();
 for(const action of parsed.actions)if(action.kind==='project-create'){if(projectKeys.has(action.key))throw new Error('Duplicate project reference');projectKeys.set(action.key,randomUUID());}
 const items=parsed.actions.map(action=>{
  const id=action.kind==='project-create'?projectKeys.get(action.key)!:randomUUID();
  if(action.kind==='project-create')return {id,kind:action.kind,changes:{name:action.name}};
  if(action.kind==='task-create'){
   if(action.projectId&&action.projectKey)throw new Error('Ambiguous project');
   const project=action.projectId?context.projects.find(row=>row.id===action.projectId):null;
   if(action.projectId&&!project||action.projectKey&&!projectKeys.has(action.projectKey))throw new Error('Unknown project');
   return {id,kind:action.kind,changes:{title:action.title,estimate_minutes:action.estimateMinutes,due_date:action.dueDate},
    ...(project?{projectId:project.id,projectVersion:project.version,before:{projectName:project.name}}:{}),
    ...(action.projectKey?{projectItemId:projectKeys.get(action.projectKey)}:{})};
  }
  if(action.kind==='routine-create'){
   new Intl.DateTimeFormat('en',{timeZone:action.timezone});
   if(action.endTime<=action.startTime||action.frequency==='weekly'&&(!action.daysOfWeek.length||new Set(action.daysOfWeek).size!==action.daysOfWeek.length))throw new Error('Invalid routine');
   return {id,kind:action.kind,changes:{title:action.title,date:action.date,startTime:action.startTime,endTime:action.endTime,timezone:action.timezone,protected:action.protected,
   rule:action.frequency==='daily'?{frequency:'daily',interval:1}:{frequency:'weekly',interval:1,days_of_week:action.daysOfWeek}}};
  }
  if(edited.has(action.targetId))throw new Error('Duplicate edit');edited.add(action.targetId);
  if(action.kind==='task-edit'){
   const task=context.tasks.find(row=>row.id===action.targetId);if(!task||!Object.keys(action.changes).length)throw new Error('Unknown task');
   return {id,kind:action.kind,targetId:task.id,expectedVersion:task.version,before:task,changes:action.changes};
  }
  const project=context.projects.find(row=>row.id===action.targetId);if(!project)throw new Error('Unknown project');
  return {id,kind:action.kind,targetId:project.id,expectedVersion:project.version,before:project,changes:{name:action.name}};
 });
 return {message:parsed.message,items};
}

