import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
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
  const v2 = structuredClone(contract.completion);
  v2.id = randomUUID(); v2.ownerId = v1.ownerId; v2.sourceId = randomUUID();
  for (const entry of v2.exercises) {
    entry.id = randomUUID();
    for (const set of entry.sets) set.id = randomUUID();
  }
  query(database, `set request.jwt.claims='{"sub":"${v1.ownerId}","role":"authenticated"}';
    do $$ begin
      if public.upload_completed_workout('${v2.id}', '${JSON.stringify(v2).replaceAll("'", "''")}'::jsonb)->>'status'<>'accepted' then
        raise exception 'V2 preservation control did not upload'; end if;
    end $$;
    insert into exercises(user_id,name,muscle_group_primary,muscle_groups_secondary,equipment,exercise_type,is_custom,created_at,updated_at)
      values('${v1.ownerId}','','other',null,'band','duration_weight',true,null,null);
    insert into exercise_media(exercise_id,gif_url,thumbnail_url,instructions,alternative_names,source,fetched_at,created_at)
      select id,'https://example.test/existing.gif',null,array['Existing instructions'],array['Legacy alias'],'legacy-source',null,null
      from exercises where is_custom and name='';
    insert into exercise_name_mappings(exercise_id,our_name,matched_name,match_confidence,created_at)
      select id,'Original mapping',null,0.123,null from exercises where is_custom and name='';
    create table custom_before as select 'exercises' as kind,to_jsonb(t) as row from exercises t
      union all select 'exercise_media',to_jsonb(t) from exercise_media t
      union all select 'exercise_name_mappings',to_jsonb(t) from exercise_name_mappings t
      union all select 'workouts',to_jsonb(t) from workouts t
      union all select 'workout_exercises',to_jsonb(t) from workout_exercises t
      union all select 'workout_sets',to_jsonb(t) from workout_sets t
      union all select 'routines',to_jsonb(t) from routines t
      union all select 'routine_exercises',to_jsonb(t) from routine_exercises t
      union all select 'train_completion_receipts',to_jsonb(t) from train_completion_receipts t;`);
  query(database, `begin; ${migration('20261025214904_train_custom_exercises_expand.sql')} commit;`);
  const customDifferences = query(database, `with after_rows as (
    select 'exercises' as kind,to_jsonb(t)-'version'-'archived_at'-'measurement_convention' as row from exercises t
    union all select 'exercise_media',to_jsonb(t) from exercise_media t
    union all select 'exercise_name_mappings',to_jsonb(t) from exercise_name_mappings t
    union all select 'workouts',to_jsonb(t) from workouts t
    union all select 'workout_exercises',to_jsonb(t) from workout_exercises t
    union all select 'workout_sets',to_jsonb(t) from workout_sets t
    union all select 'routines',to_jsonb(t) from routines t
    union all select 'routine_exercises',to_jsonb(t) from routine_exercises t
    union all select 'train_completion_receipts',to_jsonb(t) from train_completion_receipts t)
    select count(*) from ((select * from custom_before except all select * from after_rows)
      union all (select * from after_rows except all select * from custom_before)) differences;`);
  if (customDifferences !== '0') throw new Error('Custom expansion changed legacy metadata/media, v1/v2 authority or first receipts');
  if (query(database, `select count(*) from exercises where version<>1 or archived_at is not null or measurement_convention is not null`) !== '0') {
    throw new Error('Custom expansion invented historical meaning, version or archive state');
  }
  if (query(database, `select ready from fitness_private.custom_exercise_rollout`) !== 'f') throw new Error('Expansion prematurely activated the custom contract');
  console.log(`PASS historical DDL → 8 modes/custom/null/zero/deferred fields + 10,032 sets → 415 migration, ${elapsed} ms → 416 migration → 418 expansion; exact legacy rows/media and accepted v1/v2 captures/receipts unchanged; old invalid measures remain editable; custom readiness remains false`);
  const tables = ['exercises', 'exercise_media', 'exercise_name_mappings', 'workouts', 'workout_exercises',
    'workout_sets', 'routines', 'routine_exercises', 'train_completion_receipts', 'train_exercise_command_outcomes'];
  const content = () => query(database, `select md5(jsonb_build_object(${tables.map(table =>
    `'${table}',(select jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text) from public.${table} t)`).join(',')})::text);`);
  const beforeContraction = content();
  const serviceDml = query(database, `select jsonb_build_array(has_table_privilege('service_role','public.exercises','INSERT'),
    has_table_privilege('service_role','public.exercises','UPDATE'),has_table_privilege('service_role','public.exercises','DELETE'));`);
  query(database, migration('20261025234112_train_custom_exercises_enable.sql'));
  if (content() !== beforeContraction) throw new Error('Contraction rewrote existing records or first outcomes');
  if (query(database, `select ready from fitness_private.custom_exercise_rollout`) !== 't') throw new Error('Contraction did not enable commands');
  if (query(database, `select count(*) from unnest(array['anon','authenticated']) as r(role_name) cross join
    unnest(array['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) as p(privilege_name)
    where has_table_privilege(role_name,'public.exercises',privilege_name);`) !== '0') throw new Error('Contraction left an ordinary write bypass');
  if (query(database, `select has_table_privilege('service_role','public.exercises','TRUNCATE') or
    has_table_privilege('service_role','public.exercises','TRIGGER');`) !== 'f') throw new Error('Contraction left a service-role bypass');
  if (query(database, `select jsonb_build_array(has_table_privilege('service_role','public.exercises','INSERT'),
    has_table_privilege('service_role','public.exercises','UPDATE'),has_table_privilege('service_role','public.exercises','DELETE'));`) !== serviceDml) throw new Error('Contraction changed trusted preset maintenance');
  console.log('PASS exact 418 C migration: gate enabled, ordinary DML closed, trusted preset maintenance retained; all ten record/outcome tables unchanged');
  const templateTables = ['exercises','exercise_media','exercise_name_mappings','workouts','workout_exercises',
    'workout_sets','routines','routine_exercises','train_completion_receipts','train_exercise_command_outcomes'];
  const templatePreservation = (expanded = false) => query(database, `select md5(jsonb_build_object(${templateTables.map(table =>
    `'${table}',(select jsonb_agg(${expanded && table === 'routines' ? "to_jsonb(t)-array['version','archived_at']" : 'to_jsonb(t)'} order by to_jsonb(t)::text) from public.${table} t)`).join(',')})::text);`);
  const beforeTemplates = templatePreservation();
  query(database, migration('20261026001702_train_workout_templates_expand.sql'));
  if (templatePreservation(true) !== beforeTemplates) throw new Error('Template expansion changed existing fields or first receipts');
  if (query(database, 'select ready from fitness_private.template_rollout') !== 'f') throw new Error('Template expansion prematurely enabled commands');
  const expandedTemplates = templatePreservation();
  const enableTemplates = migration('20261026010107_train_workout_templates_enable.sql');
  query(database, enableTemplates);
  for (const digits of [0, 3]) {
    query(database, `set extra_float_digits=${digits}; do $$ begin
      if fitness_private.template_value_reason('9007199254740991','reps') is not null
        or fitness_private.template_value_reason('0.123','weightKg') is not null
        or fitness_private.template_value_reason(null,'weightKg') is not null then
        raise exception 'Valid target acceptance depends on caller float rendering';
      end if;
      if current_setting('extra_float_digits')<>'${digits}' then raise exception 'Successful target validation leaked its setting'; end if;
      if fitness_private.template_value_reason('9007199254740993','reps') is distinct from 'target_value_unrepresentable'
        or fitness_private.template_value_reason('1e309','weightKg') is distinct from 'target_value_unrepresentable'
        or fitness_private.template_value_reason('1.5','reps') is distinct from 'target_value_unrepresentable'
        or fitness_private.template_value_reason('-1','weightKg') is distinct from 'target_value_out_of_range'
        or fitness_private.template_value_reason('86401','durationSeconds') is distinct from 'target_value_out_of_range' then
        raise exception 'Target validation changed invalid-value semantics';
      end if;
      if current_setting('extra_float_digits')<>'${digits}' then raise exception 'Rejected target validation leaked its setting'; end if;
    end $$;`);
  }
  if (query(database, `select coalesce(proconfig@>array['extra_float_digits=3'],false) from pg_proc
    where oid='fitness_private.template_value_reason(text,text)'::regprocedure`) !== 't') throw new Error('Template numeric helper has no stable private rendering setting');
  if (query(database, 'select ready from fitness_private.template_rollout') !== 't') throw new Error('Template C migration did not enable commands');
  if (templatePreservation(true) !== beforeTemplates) throw new Error('Template materialization changed original fields/timestamps or receipts');
  if (templatePreservation() !== expandedTemplates) throw new Error('Template C changed expanded parent versions/archive state or existing records');
  if (query(database, 'select count(*) from fitness_private.template_entries') !== '8'
    || query(database, 'select count(*) from fitness_private.template_targets') !== '16') throw new Error('Legacy target materialization changed counts');
  if (query(database, `select count(*) from unnest(array['anon','authenticated','service_role']) r
    cross join unnest(array['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p
    where has_table_privilege(r,'public.routines',p) or has_table_privilege(r,'public.routine_exercises',p)`) !== '0') throw new Error('Template cutover left an ordinary content writer');
  if (query(database, `select count(*) from fitness_private.template_entries s join public.routine_exercises e on e.id=s.entry_id
    where s.position<>(select count(*) from public.routine_exercises p where p.routine_id=e.routine_id and (p.sort_order,p.id)<(e.sort_order,e.id))
      or s.targets_resolved is distinct from true
      or s.legacy_source is distinct from jsonb_build_object('targetSets',e.target_sets::text,'sortOrder',e.sort_order::text,
        'measurements',jsonb_build_object('weightKg',e.target_weight_kg::text,'reps',e.target_reps::text,'durationSeconds',e.target_duration_seconds::text,'distanceMeters',e.target_distance_meters::text))`) !== '0') throw new Error('Template C changed legacy order or raw provenance');
  if (query(database, `select count(*) from fitness_private.template_targets t join public.routine_exercises e on e.id=t.entry_id
    where t.kind<>'working' or t.position not between 0 and e.target_sets-1
      or (t.weight_kg,t.reps,t.duration_seconds,t.distance_meters) is distinct from
        (e.target_weight_kg,e.target_reps,e.target_duration_seconds,e.target_distance_meters)`) !== '0') throw new Error('Template C changed target values');
  const materializedTemplates = () => query(database, `select md5(jsonb_build_object(
    'entries',(select jsonb_agg(to_jsonb(t) order by entry_id) from fitness_private.template_entries t),
    'targets',(select jsonb_agg(to_jsonb(t) order by id) from fitness_private.template_targets t),
    'outcomes',(select jsonb_agg(to_jsonb(t) order by owner_id,operation_id) from public.train_template_command_outcomes t))::text)`);
  const firstMaterialization = materializedTemplates();
  query(database, enableTemplates);
  if (materializedTemplates() !== firstMaterialization || templatePreservation() !== expandedTemplates) throw new Error('Repeated template C changed stable IDs or existing records');
  if (query(database, `select count(*) from unnest(array['authenticated','service_role']) r
    where not has_column_privilege(r,'public.routines','last_performed_at','UPDATE')
      or has_column_privilege(r,'public.routines','name','UPDATE')
      or has_function_privilege(r,'fitness_private.activate_template_contract()','EXECUTE')`) !== '0') throw new Error('Template C usage-only privilege contract changed');
  query(database, `set request.jwt.claims='{"sub":"${v1.ownerId}","role":"authenticated"}'; set role authenticated;
    do $$ declare previous bigint; begin
      select version into previous from public.routines where id='64150000-0000-4000-8000-000000000002';
      update public.routines set last_performed_at='2026-10-26T00:00:00Z' where id='64150000-0000-4000-8000-000000000002';
      if not found or (select version from public.routines where id='64150000-0000-4000-8000-000000000002')<>previous then raise exception 'Usage write changed content revision or failed'; end if;
      begin
        update public.routines set name='Forbidden' where id='64150000-0000-4000-8000-000000000002';
        raise exception 'Ordinary template content write succeeded';
      exception when insufficient_privilege then null; end;
    end $$;`);
  console.log('PASS exact 419 A/C migrations: ten legacy/current tables and expanded parent versions preserved; eight ordered entries/sixteen exact targets; idempotent stable target IDs; commands gated until C; content DML closed and authenticated usage-only updates retained; safe-integer validation stable under caller float settings 0/3 without leakage');

  // #425–428 expansion/cutover is rehearsed against actual historical DDL and
  // retained values, never by resetting the shared Supabase database.
  const removedOriginal=structuredClone(v1); removedOriginal.id=randomUUID(); removedOriginal.sourceId=randomUUID();
  for(const entry of removedOriginal.exercises){entry.id=randomUUID();for(const set of entry.sets)set.id=randomUUID();}
  query(database,`set request.jwt.claims='{"sub":"${v1.ownerId}","role":"authenticated"}';
    do $$begin if public.upload_completed_workout('${removedOriginal.id}','${JSON.stringify(removedOriginal).replaceAll("'","''")}'::jsonb)->>'status'<>'accepted' then raise exception 'Pre-C deleted create control failed';end if;end$$;
    delete from public.workouts where id='${removedOriginal.id}';`);
  const beforeHistory=templatePreservation();
  query(database, migration('20261026035606_train_history_current_authority_expand.sql'));
  if(query(database,'select ready from fitness_private.history_rollout')!=='f'||templatePreservation()!==beforeHistory)throw new Error('History A changed legacy rows or advertised readiness');
  query(database,migration('20261026052945_train_history_enable_current_authority.sql'));
  if(templatePreservation()!==beforeHistory)throw new Error('History C rewrote legacy identity, measurements or unknowns');
  if(query(database,`select count(*) from public.workouts w left join fitness_private.history_current h on h.workout_id=w.id where w.status='completed' and (h.revision is distinct from 1 or h.projection is distinct from fitness_private.history_projection(w.id))`)!=='0')throw new Error('History C did not atomically capture each exact completed baseline');
  const baseline=query(database,`select md5(jsonb_agg(to_jsonb(h) order by workout_id)::text) from fitness_private.history_current h`);
  query(database,migration('20261026052945_train_history_enable_current_authority.sql'));
  if(query(database,`select md5(jsonb_agg(to_jsonb(h) order by workout_id)::text) from fitness_private.history_current h`)!==baseline)throw new Error('Repeated history cutover changed baselines or revisions');
  if(query(database,`select count(*) from fitness_private.history_current h cross join lateral jsonb_each(h.definitions) d where d.value?'history_recorded_definition'`)!=='0')throw new Error('Cutover invented legacy recorded meaning');
  query(database,`begin; set local request.jwt.claims='{"sub":"${v1.ownerId}","role":"authenticated"}'; set local role authenticated;
    do $$begin
      begin insert into public.workouts(id,user_id,status) values('${removedOriginal.id}','${v1.ownerId}','discarded');raise exception 'Deleted pre-C receipt identity was reused';exception when check_violation then null;end;
      if has_table_privilege('authenticated','public.workouts','TRUNCATE') or has_table_privilege('anon','public.workout_sets','TRUNCATE') or has_table_privilege('authenticated','public.workout_exercises','TRIGGER') then raise exception 'C retained direct authority bypass';end if;
      if public.upload_completed_workout('${removedOriginal.id}','${JSON.stringify(removedOriginal).replaceAll("'","''")}'::jsonb)->>'status'<>'accepted' or exists(select 1 from public.workouts where id='${removedOriginal.id}') then raise exception 'Deleted pre-C create retry resurrected data';end if;
    end$$; rollback;`);
  query(database,`begin; set local request.jwt.claims='{"sub":"${v1.ownerId}","role":"authenticated"}';
    do $$declare before_report jsonb;after_report jsonb;begin
      before_report:=public.train_history_progress('{"from":null,"through":null}','[]');
      update fitness_private.history_current set projection=jsonb_set(jsonb_set(projection,'{workout,native_completion}','{"version":1}'::jsonb),'{workout,duration_seconds}','"999999999"') where workout_id='${v1.id}';
      after_report:=public.train_history_progress('{"from":null,"through":null}','[]');
      if (select value->'current'->>'kind' from jsonb_array_elements(after_report->'records') where value->>'id'='${v1.id}')<>'unsupported'
        or (after_report->'coverage'->>'unknownDurationCount')::bigint<>(before_report->'coverage'->>'unknownDurationCount')::bigint+1
        or (after_report->'coverage'->>'knownDurationSeconds')::numeric<>(before_report->'coverage'->>'knownDurationSeconds')::numeric-${v1.durationSeconds} then raise exception 'Unsupported capture poisoned current progress coverage';end if;
    end$$;rollback;`);
  query(database,`begin; delete from public.profiles where id='${v1.ownerId}';
    do $$begin if exists(select 1 from fitness_private.history_current) or exists(select 1 from fitness_private.history_revisions) or exists(select 1 from fitness_private.history_outcomes) then raise exception 'Profile erasure retained history'; end if;end$$; rollback;`);
  console.log('PASS 425–428 A/C: ten tables unchanged, exact completed baselines including zero/null/deferred fields, no invented legacy meaning, idempotent revisions and profile erasure');


  // Exercise-library parity must work for live workouts without a template.
  const preset = JSON.parse(query(database, `select jsonb_build_object('reference',jsonb_build_object('kind','preset','exerciseId',id),'name',name,'equipment',equipment,'mode',exercise_type,'convention',null) from public.exercises where user_id is null and not is_custom and catalog_key is null and exercise_type='weight_reps' order by id limit 1`));
  const live = structuredClone(v1); live.version=3; live.id=randomUUID(); live.sourceId=randomUUID();
  live.exercises=[{id:randomUUID(),definition:preset,sets:[{id:randomUUID(),performed:{mode:'weight_reps',weightKg:12.345,reps:8,kind:'working'}}]}];
  const literal = value => `'${JSON.stringify(value).replaceAll("'","''")}'::jsonb`;
  const upload = value => query(database, `set request.jwt.claims='{"sub":"${v1.ownerId}","role":"authenticated"}'; set role authenticated; select public.upload_completed_workout('${value.id}',${literal(value)});`);
  if(JSON.parse(upload(live)).status!=='invalid_completion')throw new Error('Control no longer reproduces live preset rejection');
  const beforeLive=templatePreservation();
  query(database,migration('20261027215405_train_live_preset_recording.sql'));
  if(templatePreservation()!==beforeLive)throw new Error('Live preset expansion changed existing data');
  const acceptedLive=JSON.parse(upload(live));
  if(acceptedLive.status!=='accepted')throw new Error('Full-catalog live completion rejected: '+JSON.stringify(acceptedLive));
  if(query(database,`select recorded_completion=${literal(live)} and routine_id is null from public.workouts where id='${live.id}'`)!=='t')throw new Error('Live preset capture or template independence changed');
  if(query(database,`select weight_kg=12.345 and reps=8 from public.workout_sets where id='${live.exercises[0].sets[0].id}'`)!=='t')throw new Error('Live preset projection changed exact values');
  if(JSON.stringify(JSON.parse(upload(live)))!==JSON.stringify(acceptedLive))throw new Error('Live preset retry changed first receipt');
  const mismatched=structuredClone(live); mismatched.id=randomUUID(); mismatched.exercises[0].definition.equipment=preset.equipment==='none'?'other':'none';
  if(JSON.parse(upload(mismatched)).status!=='reference_unavailable')throw new Error('Preset authority accepted mismatched equipment');
  const foreign=structuredClone(live); foreign.id=randomUUID(); foreign.exercises[0].definition.reference.exerciseId='64150000-0000-4000-8000-000000000001';
  if(JSON.parse(upload(foreign)).status!=='reference_unavailable')throw new Error('Unowned or missing exercise accepted as a preset');
  query(database,migration('20261027215405_train_live_preset_recording.sql'));
  if(JSON.stringify(JSON.parse(upload(live)))!==JSON.stringify(acceptedLive))throw new Error('Repeated migration changed frozen receipt');
  console.log('PASS full-catalog live recording: old rejection reproduced; v3 preset IDs accepted without template origin; exact capture, projection, history and first receipt retained; mismatched/missing references rejected; migration preserves existing data and repeats safely');


  // A Hevy export remains date-only, lossless and independent of active recording.
  const beforeHevy = query(database, `select md5(coalesce(jsonb_agg(to_jsonb(h) order by workout_id)::text,'')) from fitness_private.history_current h`);
  query(database,migration('20261027234402_train_hevy_csv_import.sql'));
  if(query(database,`select md5(coalesce(jsonb_agg(to_jsonb(h) order by workout_id)::text,'')) from fitness_private.history_current h`)!==beforeHevy)throw new Error('Hevy migration changed existing current captures');
  // CHECK permissions apply even when another branch already admits the row.
  // Exercise a writer without authenticated/service membership, as constrained
  // CI fixtures and maintenance roles do, without granting it any app table.
  query(database,`create table public.hevy_constraint_probe(id uuid,owner_id uuid,started_at timestamptz,
    check(started_at is not null or fitness_private.is_hevy_workout(id,owner_id)));
    grant insert on public.hevy_constraint_probe to anon;
    set role anon;insert into public.hevy_constraint_probe values('${randomUUID()}','${v1.ownerId}',now());`);
  const {parseHevyCsv: parseHevyFixture}=await import('../../lib/fitness/hevy-csv.ts');
  const hevyRows=parseHevyFixture(readFileSync(resolve(root,'tests/fixtures/hevy-import.csv'),'utf8')).workouts.map(workout=>JSON.parse(workout.contentKey));
  const hevyRpc = (action, hash, rows=hevyRows, batch=null, user=v1.ownerId) => JSON.parse(query(database, `set request.jwt.claims='{"sub":"${user}","role":"authenticated"}'; set role authenticated;
    select public.import_hevy_workouts('${action}',${hash ? `'${hash}'` : 'null'},${literal(rows)},${batch ? `'${batch}'` : 'null'});`));
  const firstPreview = hevyRpc('preview','a'.repeat(64));
  if(firstPreview.newWorkouts!==2||firstPreview.sets!==3)throw new Error('Hevy preview totals wrong: '+JSON.stringify(firstPreview));
  const activeId=randomUUID();
  query(database,`set request.jwt.claims='{"sub":"${v1.ownerId}","role":"authenticated"}';set role authenticated;
    insert into public.workouts(id,user_id,title,status,started_at) values('${activeId}','${v1.ownerId}','Active sentinel','in_progress',now());`);
  const ordinaryEntry=randomUUID(), ordinarySet=randomUUID();
  query(database,`set request.jwt.claims='{"sub":"${v1.ownerId}","role":"authenticated"}';set role authenticated;
    insert into public.workout_exercises(id,workout_id,exercise_id,sort_order) values('${ordinaryEntry}','${activeId}',
      (select id from public.exercises where catalog_key='strength.barbell-bench-press.v1'),0);
    insert into public.workout_sets(id,workout_exercise_id,set_number,set_type,distance_meters,rpe,is_completed)
      values('${ordinarySet}','${ordinaryEntry}',1,'normal',100,6.4,false);`);
  if(query(database,`select distance_meters::text='100.00' and rpe::text='6' from public.workout_sets where id='${ordinarySet}'`)!=='t')
    throw new Error('Ordinary workout distance scale or integer effort changed');
  const activeBefore=query(database,`select to_jsonb(w)::text from public.workouts w where id='${activeId}'`);
  const hevyReceipt=hevyRpc('commit','a'.repeat(64));
  if(hevyReceipt.importedWorkouts!==2||hevyReceipt.importedSets!==3)throw new Error('Hevy commit failed: '+JSON.stringify(hevyReceipt));
  if(JSON.stringify(hevyRpc('commit','a'.repeat(64)))!==JSON.stringify(hevyReceipt))throw new Error('Hevy retry changed its receipt');
  if(query(database,`select to_jsonb(w)::text from public.workouts w where id='${activeId}'`)!==activeBefore)throw new Error('Hevy import touched active recording');
  const importedId=hevyReceipt.workoutIds[0], timedId=hevyReceipt.workoutIds[1];
  query(database,`set role anon;do $$begin
    begin insert into public.hevy_constraint_probe values('${importedId}','${v1.ownerId}',null);
      raise exception 'Unauthenticated constraint probe observed import membership';
    exception when check_violation then null;end;
  end$$;`);
  if(query(database,`set request.jwt.claims='{"sub":"64150000-0000-4000-8000-000000000099","role":"authenticated"}';set role authenticated;
    select fitness_private.is_hevy_workout('${importedId}','${v1.ownerId}');`)!=='f')throw new Error('Import constraint predicate revealed another account');
  const imported = JSON.parse(query(database,`select fitness_private.history_record('${importedId}','${v1.ownerId}')`));
  if(imported.workoutDay!=='2026-03-11'||imported.current.record.workout.started_at!==null||imported.current.record.workout.duration_seconds!==null)throw new Error('Hevy fabricated timing');
  if(JSON.stringify(imported.current.record.workout.hevy_import.sourceRows)!==JSON.stringify(hevyRows[0]))throw new Error('Hevy raw fields changed');
  if(process.env.HEVY_SYNTHETIC_FIXTURE_OUTPUT)writeFileSync(process.env.HEVY_SYNTHETIC_FIXTURE_OUTPUT,JSON.stringify(hevyReceipt.workoutIds.map(id=>JSON.parse(query(database,`select fitness_private.history_record('${id}','${v1.ownerId}')`))),null,2)+'\n');
  const firstSet=imported.current.record.exercises[0].sets[0];
  if(firstSet.weight_kg!=='4.53592370'||firstSet.rpe!=='9.5'||imported.current.record.exercises[0].sets[1].distance_meters!=='1609.344')throw new Error('Hevy decimal measurements lost precision: '+JSON.stringify(firstSet));
  if(imported.current.record.exercises[0].exercise.history_recorded_definition?.convention!==null)throw new Error('Hevy inferred comparison meaning');
  const changed=structuredClone(hevyRows); changed[0][0][9]='11';
  if(hevyRpc('commit','a'.repeat(64),changed).status!=='operation_conflict')throw new Error('Hevy operation identity was reused');
  const changedPreview=hevyRpc('preview','b'.repeat(64),changed);
  if(changedPreview.changedWorkouts!==1||changedPreview.duplicateWorkouts!==1||changedPreview.newWorkouts!==0)throw new Error('Hevy changed match was not protected');
  for (const field of [0,1,2]) {
    const edited=structuredClone(hevyRows);
    for (const row of edited[0]) row[field]=field===0?'Renamed import':field===1?'11 Mar 2026, 23:45':'12 Mar 2026, 00:25';
    const candidate=hevyRpc('preview','e'.repeat(64),edited);
    if(candidate.newWorkouts!==0||candidate.changedWorkouts!==1)throw new Error('An edited source header was treated as a new workout');
    const skipped=hevyRpc('commit',String(field+1).repeat(64),edited);
    if(skipped.importedWorkouts!==0||skipped.changedWorkouts!==1)throw new Error('Edited source header duplicated current history');
  }
  for (const anchor of ['start','title-end']) {
    const first=structuredClone(hevyRows[0][0]);
    first[0]=`Same-file ${anchor}`; first[1]=anchor==='start'?'01 Jan 2020, 12:00':'02 Jan 2020, 12:00'; first[2]=anchor==='start'?'01 Jan 2020, 13:00':'02 Jan 2020, 13:00';
    const second=structuredClone(first);
    if(anchor==='start'){second[0]+=' renamed';second[2]='01 Jan 2020, 13:30';}else second[1]='02 Jan 2020, 12:30';
    const collision=[[first],[second]], hash=(anchor==='start'?'6':'7').repeat(64);
    const preview=hevyRpc('preview',hash,collision), committed=hevyRpc('commit',hash,collision);
    if(preview.newWorkouts!==1||preview.changedWorkouts!==1||committed.importedWorkouts!==preview.newWorkouts||committed.changedWorkouts!==preview.changedWorkouts)
      throw new Error('Same-file candidate classification differed between review and commit: '+JSON.stringify({anchor,preview,committed}));
  }
  const command = {protocolVersion:1,ownerId:v1.ownerId,operationId:randomUUID(),command:{kind:'correct-workout',workoutId:importedId,expectedRevision:'1',patch:{time:{kind:'date-only',workoutDay:'2026-03-13',duration:{kind:'set',seconds:123}}}}};
  const corrected=JSON.parse(query(database,`set request.jwt.claims='{"sub":"${v1.ownerId}","role":"authenticated"}';set role authenticated;select public.execute_train_history_command(${literal(command)});`));
  if(corrected.receipt?.current.workoutDay!=='2026-03-13')throw new Error('Imported date correction failed: '+JSON.stringify(corrected));
  if(query(database,`select fitness_private.history_record('${importedId}','${v1.ownerId}')->'current'->'record'->'workout'->>'duration_seconds'`)!=='123')throw new Error('Imported duration correction lost');
  const undo=hevyRpc('undo',null,null,hevyReceipt.batchId);
  if(undo.removedWorkouts!==1||undo.changedWorkouts!==1)throw new Error('Hevy undo erased a later correction: '+JSON.stringify(undo));
  if(JSON.stringify(hevyRpc('undo',null,null,hevyReceipt.batchId))!==JSON.stringify(undo))throw new Error('Hevy undo retry changed outcome');
  const recovered=hevyRpc('preview','a'.repeat(64));
  if(JSON.stringify(recovered.previousImport?.receipt)!==JSON.stringify(hevyReceipt)||JSON.stringify(recovered.previousImport?.undo)!==JSON.stringify(undo))throw new Error('Previous import/undo outcome was not recovered');
  hevyRpc('commit','a'.repeat(64));
  if(query(database,`select state from fitness_private.history_current where workout_id='${timedId}'`)!=='deleted')throw new Error('Hevy retry resurrected deleted history');
  if(hevyRpc('undo',null,null,hevyReceipt.batchId,'64150000-0000-4000-8000-000000000099').status!=='not_found')throw new Error('Hevy batch leaked across accounts');
  const bad=structuredClone(hevyRows); bad[0][0][0]='New staged workout'; bad[0][1][0]='New staged workout'; bad[1][0][9]='NaN';
  if(hevyRpc('commit','c'.repeat(64),bad).status!=='invalid_request')throw new Error('Hevy accepted invalid measurements');
  if(query(database,`select count(*) from public.workouts where title='New staged workout'`)!=='0')throw new Error('Hevy partial failure leaked committed records');
  query(database,`begin;set local request.jwt.claims='{"sub":"${v1.ownerId}","role":"authenticated"}';
    select public.execute_train_history_command(${literal({protocolVersion:1,ownerId:v1.ownerId,operationId:randomUUID(),command:{kind:'correct-workout',workoutId:live.id,expectedRevision:'1',patch:{time:{kind:'known-instants',duration:{kind:'unknown'}}}}})});
    select fitness_private.assert_history_projection('${live.id}');rollback;`);
  if(process.env.HEVY_CSV_VERIFICATION_FILE){
    const {parseHevyCsv}=await import('../../lib/fitness/hevy-csv.ts');
    const actual=parseHevyCsv(readFileSync(process.env.HEVY_CSV_VERIFICATION_FILE,'utf8'));
    const raw=actual.workouts.map(workout=>JSON.parse(workout.contentKey));
    const accepted=hevyRpc('commit','d'.repeat(64),raw);
    if(accepted.importedWorkouts!==actual.workouts.length||accepted.importedSets!==actual.sets)throw new Error('Actual export totals did not round-trip');
    if(hevyRpc('preview','d'.repeat(64),raw).duplicateWorkouts!==actual.workouts.length)throw new Error('Actual export retry duplicates');
    console.log(`PASS private export in disposable DB: ${actual.workouts.length} workouts / ${actual.sets} source sets / ${actual.exerciseNames.length} names; no production import`);
  }
  console.log('PASS Hevy import: raw facts and decimal units, date-only authority, original captures, owner isolation, retry/conflict/rollback, active recording, correction-aware undo and no resurrection');


} finally {
  if (created) query('postgres', `drop database ${database};`);
}
