import Decimal from 'decimal.js';
import { historyRecordSchema } from '@/lib/validations/train-history';
/** Compatibility fields are numeric only when representable. Exact legacy
 * spellings and all unknown fields remain in currentHistory.current.record. */
export function historyNumber(value: unknown): number | null {
  if(value===null)return null;
  if(typeof value==='number')return Number.isFinite(value)?value:null;
  if(typeof value!=='string'||!value.length)return null;
  const number=Number(value);
  try{return Number.isFinite(number)&&new Decimal(value).equals(new Decimal(number))?number:null;}catch{return null;}
}
export function compatibilityWorkout(input: unknown, owner?:string):Record<string,unknown>{
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Invalid current workout');
  const row=input as Record<string,unknown>, current=historyRecordSchema.safeParse(row.currentHistory);
  if(!current.success||current.data.state!=='alive'||row.id!==current.data.id||row.user_id!==current.data.ownerId||owner!==undefined&&row.user_id!==owner||!Array.isArray(row.workout_exercises))throw new Error('Invalid current workout');
  return {...row,duration_seconds:historyNumber(row.duration_seconds),workout_exercises:row.workout_exercises.map(entry=>{
    if(!entry||typeof entry!=='object'||!Array.isArray(entry.sets)||entry.workout_id!==row.id)throw new Error('Invalid current workout');
    return {...entry,sort_order:historyNumber(entry.sort_order),rest_timer_seconds:historyNumber(entry.rest_timer_seconds),sets:entry.sets.map((set:Record<string,unknown>)=>{
      if(set.workout_exercise_id!==entry.id)throw new Error('Invalid current workout');
      return {...set,weight_kg:historyNumber(set.weight_kg),reps:historyNumber(set.reps),duration_seconds:historyNumber(set.duration_seconds),distance_meters:historyNumber(set.distance_meters),rpe:historyNumber(set.rpe)};
    })};
  })};
}
export type HistoryCompatibilityReader=(owner:string|undefined,id:string|null,limit:number|null,offset:number)=>Promise<{data:unknown;error:unknown}>;
