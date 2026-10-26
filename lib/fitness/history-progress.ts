import {recordedExerciseDefinitionSchema} from '@/lib/validations/workout-definition';
import {historyNumber} from './history-compat';
import { recordedPerformedSchema, type CapturedDefinition, type RecordedCompletion } from '@/lib/validations/workout-recording';
import type { HistoryRecord } from '@/lib/validations/train-history';
import { recordedName } from './recorded-definition';
export type ComparableSource={workoutId:string;revision:string;workoutDay:string|null;entryId:string;setId:string;weightKg:number|null;reps:number|null;durationSeconds:number|null};
export type ComparableRecord={metric:'reps'|'loadKg'|'durationSeconds';at:{kind:'loadKg'|'reps'|'assistanceKg';value:number}|null;value:number;sources:ComparableSource[]};
export type ComparableGroup={key:string;name:string;definition:CapturedDefinition;history:ComparableSource[];records:ComparableRecord[]};
export function definitionComparisonKey(definition:CapturedDefinition):string|null{
 if(definition.convention===null)return null;
 const identity='reference'in definition?[definition.reference.kind,definition.reference.exerciseId,...(definition.reference.kind==='custom'?[definition.reference.ownerId]:[])]:['catalog',definition.catalogKey];
 return JSON.stringify([identity,definition.equipment,definition.mode,definition.convention]);
}
function values(set:RecordedCompletion['exercises'][number]['sets'][number]){
 const performed='mode'in set.performed?set.performed:{mode:'weight_reps' as const,...set.performed};
 if(performed.kind!=='working')return null;
 return {mode:performed.mode,weightKg:'weightKg'in performed?performed.weightKg:'addedWeightKg'in performed?performed.addedWeightKg:'assistanceKg'in performed?performed.assistanceKg:null,
  reps:'reps'in performed?performed.reps:null,durationSeconds:'durationSeconds'in performed?performed.durationSeconds:null};
}
function entriesForComparison(row:HistoryRecord):Array<RecordedCompletion['exercises'][number]>{
 if(row.state!=='alive')return [];
 if(row.current?.kind==='recorded')return row.current.document.exercises;
 if(row.current?.kind!=='legacy')return [];
 return row.current.record.exercises.flatMap(entry=>{
  const raw=entry.exercise as Record<string,unknown>|null;
  const definition=recordedExerciseDefinitionSchema.safeParse(raw?.history_recorded_definition);
  if(!definition.success||definition.data.convention===null||typeof entry.id!=='string'||!Array.isArray(entry.sets))return [];
  const mode=definition.data.mode;
  const sets=entry.sets.flatMap((set:Record<string,unknown>)=>{
   if(set.is_completed!==true||typeof set.id!=='string'||!['normal','warmup'].includes(String(set.set_type)))return [];
   const measurement={mode,kind:set.set_type==='normal'?'working':'warmup',
    ...(mode==='duration'?{durationSeconds:historyNumber(set.duration_seconds)}:{reps:historyNumber(set.reps)}),
    ...(mode==='weight_reps'?{weightKg:historyNumber(set.weight_kg)}:mode==='weighted_bodyweight'?{addedWeightKg:historyNumber(set.weight_kg)}:mode==='assisted_bodyweight'?{assistanceKg:historyNumber(set.weight_kg)}:{}),
   };
   const performed=recordedPerformedSchema.safeParse(measurement);
   return performed.success?[{id:set.id,performed:performed.data}]:[];
  });
  return [{id:entry.id,definition:definition.data,sets}];
 });
}
/** Equal-condition records only; all tied source identities remain inspectable.
 * A legacy row without captured convention is deliberately not ranked. */
export function comparableHistory(records:HistoryRecord[]):ComparableGroup[]{
 const groups=new Map<string,ComparableGroup>();
 for(const row of records){
  for(const entry of entriesForComparison(row)){
   const key=definitionComparisonKey(entry.definition);if(key===null)continue;
   let group=groups.get(key);
   for(const set of entry.sets){
    const performed=values(set);if(!performed)continue;
    if(!group){group={key,name:recordedName(entry.definition),definition:entry.definition,history:[],records:[]};groups.set(key,group);}
    const {mode,...measurements}=performed;
    const source:ComparableSource={workoutId:row.id,revision:row.revision,workoutDay:row.workoutDay,entryId:entry.id,setId:set.id,...measurements};
    group.history.push(source);
    const compare=(metric:ComparableRecord['metric'],at:ComparableRecord['at'],value:number)=>{
     const previous=group!.records.find(record=>record.metric===metric&&JSON.stringify(record.at)===JSON.stringify(at));
     if(!previous)group!.records.push({metric,at,value,sources:[source]});
     else if(value>previous.value){previous.value=value;previous.sources=[source];}
     else if(value===previous.value)previous.sources.push(source);
    };
    if(mode==='weight_reps'||mode==='weighted_bodyweight'){
     compare('reps',{kind:'loadKg',value:performed.weightKg!},performed.reps!);
     compare('loadKg',{kind:'reps',value:performed.reps!},performed.weightKg!);
    }else if(mode==='assisted_bodyweight')compare('reps',{kind:'assistanceKg',value:performed.weightKg!},performed.reps!);
    else if(mode==='bodyweight_reps')compare('reps',null,performed.reps!);
    else if(mode==='duration')compare('durationSeconds',null,performed.durationSeconds!);
   }
  }
 }
 return [...groups.values()];
}
