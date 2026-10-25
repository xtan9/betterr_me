import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Rebuild only the historical fitness schema in a newly created, uniquely named
// disposable database. Never resets or changes the running Supabase database.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const psql = process.env.PSQL_BIN ?? '/opt/homebrew/bin/psql';
const database = `train_preservation_${randomUUID().replaceAll('-', '')}`;
const base = 'postgresql://postgres:postgres@127.0.0.1:54322/';
function query(name, input) {
  const result = spawnSync(psql, [base + name, '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'], { input, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}
function migration(name) { return readFileSync(resolve(root, 'supabase/migrations', name), 'utf8'); }
let created = false;
try {
  query('postgres', `create database ${database};`); created = true;
  query(database, `create schema auth;
    create function auth.uid() returns uuid language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),
      nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
    grant usage on schema auth,public to authenticated,service_role;
    create table public.profiles(id uuid primary key);
    create function public.update_updated_at_column() returns trigger language plpgsql as $$begin new.updated_at=now(); return new; end$$;`);
  for (const name of [
    '20260224000001_create_fitness_tables.sql', '20260224000002_seed_preset_exercises.sql',
    '20260224000003_add_workout_discarded_status.sql', '20260330000001_create_exercise_media.sql',
    '20260731031730_start_workout_from_routine.sql',
    '20260731134751_save_workout_as_routine.sql', '20260731150000_enforce_fitness_exercise_ownership.sql',
    '20260801180000_centralize_active_workout_editing.sql', '20260801200000_centralize_workout_terminal_transitions.sql',
    '20261025050934_train_starter_catalog_keys.sql',
  ]) query(database, migration(name));
  query(database, `insert into profiles values ('64150000-0000-4000-8000-000000000001');
    insert into routines(id,user_id,name,notes) values ('64150000-0000-4000-8000-000000000002','64150000-0000-4000-8000-000000000001','Preserved routine','Legacy notes');
    insert into workouts(id,user_id,status,title,completed_at,duration_seconds,notes,routine_id) values
      ('64150000-0000-4000-8000-000000000003','64150000-0000-4000-8000-000000000001','completed','All modes',now(),123,'Keep me','64150000-0000-4000-8000-000000000002'),
      ('64150000-0000-4000-8000-000000000004','64150000-0000-4000-8000-000000000001','completed','Legacy zero sets',null,null,null,null);
    do $$ declare mode text; i integer:=0; definition uuid; entry uuid; begin
      foreach mode in array array['weight_reps','bodyweight_reps','weighted_bodyweight','assisted_bodyweight','duration','duration_weight','distance_duration','weight_distance'] loop
        i:=i+1;
        insert into exercises(user_id,name,muscle_group_primary,equipment,exercise_type,is_custom)
          values('64150000-0000-4000-8000-000000000001',mode,'other','other',mode,true) returning id into definition;
        insert into workout_exercises(workout_id,exercise_id,sort_order,notes,rest_timer_seconds)
          values('64150000-0000-4000-8000-000000000003',definition,i*65536,'entry notes',case when i%2=0 then null else 0 end) returning id into entry;
        insert into workout_sets(workout_exercise_id,set_number,set_type,weight_kg,reps,duration_seconds,distance_meters,rpe,is_completed)
          values(entry,1,'normal',12.34,2147483647,87,1.23,6,true), (entry,2,'warmup',null,null,null,null,null,false),
            (entry,3,'drop',0,0,0,0,1,true), (entry,4,'failure',-1,-1,null,null,null,true);
        insert into routine_exercises(routine_id,exercise_id,sort_order,target_sets,target_reps,target_weight_kg,target_duration_seconds,target_distance_meters,rest_timer_seconds,notes)
          values('64150000-0000-4000-8000-000000000002',definition,i*65536,2,2147483647,12.34,87,1.23,null,'target notes');
      end loop;
    end $$;
    insert into workout_sets(workout_exercise_id,set_number,set_type,weight_kg,reps,is_completed)
      select (select id from workout_exercises order by id limit 1),100+value,'normal',12.34,5,true from generate_series(1,10000) value;
    create table preservation_before as select 'exercises' as kind,to_jsonb(t) as row from exercises t
      union all select 'workouts',to_jsonb(t) from workouts t
      union all select 'workout_exercises',to_jsonb(t) from workout_exercises t
      union all select 'workout_sets',to_jsonb(t) from workout_sets t
      union all select 'routines',to_jsonb(t) from routines t
      union all select 'routine_exercises',to_jsonb(t) from routine_exercises t;`);
  const started = performance.now();
  query(database, `begin; ${migration('20261025130532_train_completed_upload.sql')} commit;`);
  const elapsed = Math.round(performance.now() - started);
  const different = query(database, `with after_rows as (
    select 'exercises' as kind,to_jsonb(t) as row from exercises t
    union all select 'workouts',to_jsonb(t)-'native_completion' from workouts t
    union all select 'workout_exercises',to_jsonb(t) from workout_exercises t
    union all select 'workout_sets',to_jsonb(t) from workout_sets t
    union all select 'routines',to_jsonb(t) from routines t
    union all select 'routine_exercises',to_jsonb(t) from routine_exercises t)
    select count(*) from ((select * from preservation_before except all select * from after_rows)
      union all (select * from after_rows except all select * from preservation_before)) differences;`);
  if (different !== '0') throw new Error('Migration changed a legacy identity, value or null');
  const contract = JSON.parse(readFileSync(resolve(root, 'tests/fixtures/train-measurement-contract.json'), 'utf8'));
  const v1 = structuredClone(contract.completion);
  v1.version = 1; v1.ownerId = '64150000-0000-4000-8000-000000000001'; v1.exercises = [v1.exercises[0]];
  delete v1.exercises[0].sets[0].performed.mode;
  query(database, `set request.jwt.claims='{"sub":"64150000-0000-4000-8000-000000000001","role":"authenticated"}';
    do $$ begin
      if public.upload_completed_workout('${v1.id}', '${JSON.stringify(v1).replaceAll("'", "''")}'::jsonb)->>'status'<>'accepted' then
        raise exception 'V1 preservation control did not upload'; end if;
    end $$;
    create table measurement_before as select 'exercises' as kind,to_jsonb(t) as row from exercises t
      union all select 'workouts',to_jsonb(t) from workouts t
      union all select 'workout_exercises',to_jsonb(t) from workout_exercises t
      union all select 'workout_sets',to_jsonb(t) from workout_sets t
      union all select 'routines',to_jsonb(t) from routines t
      union all select 'routine_exercises',to_jsonb(t) from routine_exercises t
      union all select 'train_completion_receipts',to_jsonb(t) from train_completion_receipts t;`);
  query(database, `begin; ${migration('20261025154855_train_measurement_completion.sql')} commit;`);
  const measurementDifferences = query(database, `with after_rows as (
    select 'exercises' as kind,case when (t.catalog_key,b.row->>'name') in (
      ('strength.push-up.v1','Push-up'),('strength.pull-up.v1','Pull-up'),('strength.dip.v1','Dip'),
      ('strength.bodyweight-squat.v1','Bodyweight Squat'),('strength.plank.v1','Plank'),('strength.jump-rope.v1','Jump Rope')
    ) and b.row->'catalog_key'='null'::jsonb
      then to_jsonb(t)||jsonb_build_object('catalog_key',b.row->'catalog_key','updated_at',b.row->'updated_at')
      else to_jsonb(t) end as row
    from exercises t join measurement_before b on b.kind='exercises' and b.row->>'id'=t.id::text
    union all select 'workouts',to_jsonb(t)-'recorded_completion' from workouts t
    union all select 'workout_exercises',to_jsonb(t) from workout_exercises t
    union all select 'workout_sets',to_jsonb(t) from workout_sets t
    union all select 'routines',to_jsonb(t) from routines t
    union all select 'routine_exercises',to_jsonb(t) from routine_exercises t
    union all select 'train_completion_receipts',to_jsonb(t) from train_completion_receipts t)
    select count(*) from ((select * from measurement_before except all select * from after_rows)
      union all (select * from after_rows except all select * from measurement_before)) differences;`);
  if (measurementDifferences !== '0') throw new Error('Measurement migration changed legacy or v1 records/receipts');
  if (query(database, `select (select count(*) from exercises)-(select count(*) from measurement_before where kind='exercises')`) !== '4') throw new Error('Unexpected catalog identity addition');
  if (query(database, `select count(*) from exercises where catalog_key is not null`) !== '22') throw new Error('Starter catalog is incomplete');
  query(database, `set request.jwt.claims='{"sub":"64150000-0000-4000-8000-000000000001","role":"authenticated"}';
    set role authenticated;
    do $$declare result jsonb; begin
      result:=public.complete_workout_atomically(auth.uid(),'64150000-0000-4000-8000-000000000004',now(),'{}');
      if result->>'type'<>'already-applied' then raise exception 'Legacy zero-set completion lost its terminal readback'; end if;
      update workout_sets set rpe=7 where reps=-1;
    end$$;`);
  console.log(`PASS historical DDL → 8 modes/custom/null/zero/deferred fields + 10,032 sets → 415 migration, ${elapsed} ms → 416 migration + accepted v1 receipt preservation; exact rows unchanged; legacy invalid measures remain editable without coercion`);
} finally {
  if (created) query('postgres', `drop database ${database};`);
}
