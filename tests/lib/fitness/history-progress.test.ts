import {describe,expect,it} from 'vitest';
import fixture from '@/tests/fixtures/train-history-contract.json';
import {historyRecordSchema,type HistoryRecord} from '@/lib/validations/train-history';
import {comparableHistory} from '@/lib/fitness/history-progress';
const base=()=>historyRecordSchema.parse(structuredClone(fixture.record));
function modify(id:string,reps:number,load:number,kind:'working'|'warmup'='working'){
 const row=base();row.id=id;row.order.id=id;
 if(row.current?.kind!=='recorded')throw new Error('fixture');
 row.current.document.id=id;row.current.document.exercises=row.current.document.exercises.slice(0,1);
 row.current.document.exercises[0].sets[0].performed={mode:'weight_reps',weightKg:load,reps,kind};return row;
}
describe('current comparable working-set progress',()=>{
 it('compares equal load/equal reps separately and retains ties, identities and revisions',()=>{
  const a=modify('64250000-0000-4000-8000-000000000021',5,10);
  const b=modify('64250000-0000-4000-8000-000000000022',8,10);b.revision='2';
  const c=modify('64250000-0000-4000-8000-000000000023',5,20);
  const d=modify('64250000-0000-4000-8000-000000000024',8,10);
  const warmup=modify('64250000-0000-4000-8000-000000000025',100,100,'warmup');
  const [group]=comparableHistory([a,b,c,d,warmup]);
  expect(group.history).toHaveLength(4);
  expect(group.records.find(row=>row.metric==='reps'&&row.at?.value===10)).toMatchObject({value:8,sources:[{workoutId:b.id,revision:'2'},{workoutId:d.id}]});
  expect(group.records.find(row=>row.metric==='loadKg'&&row.at?.value===5)).toMatchObject({value:20,sources:[{workoutId:c.id}]});
  expect(group.records).toHaveLength(4);
  expect(comparableHistory([{...a,state:'deleted',current:null}])).toEqual([]);
 });
 it('keeps assistance conditions separate and never ranks unknown or deferred meaning',()=>{
  const a=base(),b=base();
  for(const [row,load,reps] of [[a,0,5],[b,10,20]] as const){
   if(row.current?.kind!=='recorded')throw new Error('fixture');
   row.current.document.exercises=row.current.document.exercises.slice(3,4);
   row.current.document.exercises[0].sets[0].performed={mode:'assisted_bodyweight',assistanceKg:load,reps,kind:'working'};
  }
  const [group]=comparableHistory([a,b]);expect(group.records.map(row=>({at:row.at,value:row.value}))).toEqual([{at:{kind:'assistanceKg',value:0},value:5},{at:{kind:'assistanceKg',value:10},value:20}]);
  if(a.current?.kind!=='recorded')throw new Error('fixture');
  a.current.document.exercises[0].definition={reference:{kind:'custom',exerciseId:'64250000-0000-4000-8000-000000000041',ownerId:a.ownerId},name:'Unknown old meaning',equipment:'machine',mode:'assisted_bodyweight',convention:null};
  expect(comparableHistory([a,{...b,current:{kind:'unsupported',document:{version:999}}}])).toEqual([]);
 });
 it('ranks a new Web captured convention but never backfills an old legacy convention',()=>{
  const raw=base(),definition=fixture.completion.exercises[0].definition;
  const row:HistoryRecord={...raw,workoutDay:null,current:{kind:'legacy',record:{workout:{id:raw.id,user_id:raw.ownerId},exercises:[{id:'entry',exercise:{history_recorded_definition:definition},sets:[{id:'set',is_completed:true,set_type:'normal',weight_kg:'0.123',reps:'5',duration_seconds:null}]}]}}};
  expect(comparableHistory([row])[0].history[0]).toMatchObject({weightKg:0.123,reps:5,workoutDay:null});
  if(row.current?.kind!=='legacy')throw new Error('fixture');row.current.record.exercises[0].exercise={...definition};
  expect(comparableHistory([row])).toEqual([]);
 });
});
