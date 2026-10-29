/** Prints a bounded maintenance transaction; it never connects to a database. */
import { readFileSync } from 'node:fs';

const catalog = JSON.parse(readFileSync(new URL('../../lib/exercisedb/exercise-catalog.json', import.meta.url), 'utf8'));
const provenance = JSON.parse(readFileSync(new URL('../../lib/exercisedb/exercise-catalog-provenance.json', import.meta.url), 'utf8'));
const additionIds = new Set(provenance.hevyCoverageAdditional.entries.map(row => row.preset_id));
const additions = catalog.filter(row => additionIds.has(row.preset_id));
const baseline = catalog.filter(row => !additionIds.has(row.preset_id));
if (catalog.length !== 410 || baseline.length !== 400 || additions.length !== 10 || additionIds.size !== 10) {
  throw new Error('This maintenance operation only supports the reviewed 400 + 10 catalog');
}
if (process.argv.length > 3 || ![undefined, '--preflight', '--apply'].includes(process.argv[2])) {
  throw new Error('Usage: node scripts/maintenance/prepare-hevy-catalog-sync.mjs [--preflight|--apply]');
}
const jsonLiteral = value => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
const record = '(preset_id uuid,name text,equipment text,exercise_type text,muscle_group_primary text,muscle_groups_secondary text[])';
const baselineJson = jsonLiteral(baseline.map(({ preset_id, name, equipment, exercise_type }) => ({ preset_id, name, equipment, exercise_type })));
const additionsJson = jsonLiteral(additions);
const baselineConflict = `select 1 from jsonb_to_recordset(baseline) as b${record} left join public.exercises e on e.id=b.preset_id where e.id is null or row(e.name,e.equipment,e.exercise_type,e.user_id,e.is_custom) is distinct from row(b.name,b.equipment,b.exercise_type,null::uuid,false)`;
const identityConflict = `select 1 from jsonb_to_recordset(additions) as a${record} join public.exercises e on e.id=a.preset_id where row(e.name,e.equipment,e.exercise_type,e.muscle_group_primary,e.muscle_groups_secondary,e.user_id,e.is_custom,e.archived_at,e.catalog_key,e.measurement_convention) is distinct from row(a.name,a.equipment,a.exercise_type,a.muscle_group_primary,a.muscle_groups_secondary,null::uuid,false,null::timestamptz,null::text,null::text)`;
const definitionConflict = `select 1 from jsonb_to_recordset(additions) as a${record} join public.exercises e on lower(trim(e.name))=lower(trim(a.name)) and e.equipment=a.equipment and e.exercise_type=a.exercise_type and e.user_id is null and not e.is_custom where e.id<>a.preset_id`;
const conflictsIn = (query, name) => query.replaceAll('jsonb_to_recordset(baseline)', 'jsonb_to_recordset(manifest.baseline)').replaceAll('jsonb_to_recordset(additions)', 'jsonb_to_recordset(manifest.additions)').replace('select 1', 'select count(*)') + `) as ${name}`;
if (process.argv[2] !== '--apply') {
  console.log(`with manifest as (select ${baselineJson} as baseline,${additionsJson} as additions)
select jsonb_array_length(baseline) as baseline_count, jsonb_array_length(additions) as additions,
 (${conflictsIn(baselineConflict, 'baseline_missing_or_changed')},
 (${conflictsIn(identityConflict, 'identity_conflicts')},
 (${conflictsIn(definitionConflict, 'definition_conflicts')},
 (select count(*) from jsonb_to_recordset(additions) as a${record} where not exists(select 1 from public.exercises e where e.id=a.preset_id)) as missing,
 (select count(*) from public.exercises where user_id is null and not is_custom) as current_presets
from manifest;`);
} else {
  const tables = ['public.workouts', 'public.workout_exercises', 'public.workout_sets', 'public.routines', 'public.routine_exercises', 'fitness_private.history_current', 'fitness_private.history_revisions', 'fitness_private.hevy_import_batches', 'fitness_private.hevy_import_workouts'];
  const hashes = variable => tables.map(table => ` select ${variable} || jsonb_build_object('${table}', (select md5(coalesce(string_agg(to_jsonb(t)::text,'' order by to_jsonb(t)::text),'')) from ${table} t)) into ${variable};`).join('\n');
  console.log(`-- Run only after the zero-conflict preflight and mobile artwork acceptance.
begin isolation level repeatable read;
set local lock_timeout='5s';
set local statement_timeout='30s';
lock table public.exercises in share row exclusive mode;
do $sync$
declare
 baseline jsonb := ${baselineJson}; additions jsonb := ${additionsJson};
 before_exercises jsonb; after_exercises jsonb;
 before_related jsonb := '{}'; after_related jsonb := '{}';
 inserted_count integer; before_count integer;
begin
 if exists(${baselineConflict}) then raise exception 'Existing 400-preset baseline is missing or changed'; end if;
 if exists(${identityConflict}) then raise exception 'Addition UUID conflicts with existing identity'; end if;
 if exists(${definitionConflict}) then raise exception 'Addition conflicts with existing definition'; end if;
 select count(*), coalesce(jsonb_object_agg(e.id::text,to_jsonb(e)),'{}') into before_count,before_exercises from public.exercises e;
${hashes('before_related')}
 insert into public.exercises(id,name,equipment,exercise_type,muscle_group_primary,muscle_groups_secondary,user_id,is_custom)
 select a.preset_id,a.name,a.equipment,a.exercise_type,a.muscle_group_primary,a.muscle_groups_secondary,null,false
 from jsonb_to_recordset(additions) as a(preset_id uuid,name text,equipment text,exercise_type text,muscle_group_primary text,muscle_groups_secondary text[])
 where not exists(select 1 from public.exercises e where e.id=a.preset_id);
 get diagnostics inserted_count = row_count;
 select coalesce(jsonb_object_agg(e.id::text,to_jsonb(e)),'{}') into after_exercises from public.exercises e where before_exercises ? e.id::text;
 if after_exercises is distinct from before_exercises or (select count(*) from public.exercises)<>before_count+inserted_count then raise exception 'Existing exercise data was altered'; end if;
${hashes('after_related')}
 if after_related is distinct from before_related then raise exception 'Workout, template or import history was altered'; end if;
 if (select count(*) from jsonb_to_recordset(additions) as a${record} join public.exercises e on e.id=a.preset_id where row(e.name,e.equipment,e.exercise_type,e.muscle_group_primary,e.muscle_groups_secondary,e.user_id,e.is_custom,e.archived_at,e.catalog_key,e.measurement_convention) is not distinct from row(a.name,a.equipment,a.exercise_type,a.muscle_group_primary,a.muscle_groups_secondary,null::uuid,false,null::timestamptz,null::text,null::text))<>10 then raise exception 'Incomplete addition'; end if;
 perform set_config('betterrme.hevy_catalog_inserted',inserted_count::text,true);
end $sync$;
select jsonb_build_object('inserted',current_setting('betterrme.hevy_catalog_inserted')::integer,'presets',(select count(*) from public.exercises where user_id is null and not is_custom),'existing_rows_unchanged',true,'history_unchanged',true) as result;
commit;`);
}
