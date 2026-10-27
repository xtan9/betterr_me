-- The full exercise library shares template preset IDs. Live v3 completions
-- can capture those IDs without inventing a template origin or a catalog key.
-- Reference ownership, equipment and mode are still checked by the upload
-- transaction. Existing documents, receipts, data and privileges are unchanged.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create or replace function fitness_private.valid_recorded_definition(definition jsonb,owner text,version integer) returns boolean
language plpgsql immutable set search_path=pg_catalog as $$
declare canonical_custom_uuid constant text:='^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
begin
   if version>=3 and definition ? 'reference' then
     if version>=3 and definition->'reference'->>'kind'='preset' then
      if not coalesce(fitness_private.exact_keys(definition,array['reference','name','equipment','mode','convention']),false)
       or not coalesce(fitness_private.exact_keys(definition->'reference',array['kind','exerciseId']),false)
       or not fitness_private.template_uuid(definition->'reference'->'exerciseId') or jsonb_typeof(definition->'name') is distinct from 'string'
       or not coalesce(definition->>'equipment' in('barbell','dumbbell','machine','bodyweight','kettlebell','band','cable','other','none'),false)
       or not coalesce(definition->>'mode' in('weight_reps','bodyweight_reps','weighted_bodyweight','assisted_bodyweight','duration'),false)
       or definition->'convention' is distinct from 'null'::jsonb then return false; end if;
     else
     if not fitness_private.exact_keys(definition,array['reference','name','equipment','mode','convention'])
       or not fitness_private.exact_keys(definition->'reference',array['kind','exerciseId','ownerId'])
       or definition->'reference'->>'kind' is distinct from 'custom'
       or not coalesce(fitness_private.valid_uuid(definition->'reference'->'exerciseId') and fitness_private.valid_uuid(definition->'reference'->'ownerId'),false)
       or not coalesce(definition->'reference'->>'exerciseId' ~ canonical_custom_uuid and definition->'reference'->>'ownerId' ~ canonical_custom_uuid,false)
       or definition->'reference'->>'ownerId' is distinct from owner
       or jsonb_typeof(definition->'name') is distinct from 'string'
       or not coalesce(definition->>'equipment' in ('barbell','dumbbell','machine','bodyweight','kettlebell','band','cable','other','none'),false)
       or not coalesce(definition->>'mode' in ('weight_reps','bodyweight_reps','weighted_bodyweight','assisted_bodyweight','duration'),false)
       or not coalesce(definition->'convention'='null'::jsonb or (jsonb_typeof(definition->'convention')='string'
         and definition->>'convention'=fitness_private.custom_exercise_convention(definition->>'equipment',definition->>'mode')),false)
       then return false; end if;
     end if;
   else
   if not fitness_private.exact_keys(definition,array['catalogKey','name','equipment','mode','convention'])
     or jsonb_typeof(definition->'catalogKey') is distinct from 'string' or definition->>'catalogKey' !~ '^strength\.[a-z0-9-]+\.v[1-9][0-9]*$'
     or not fitness_private.exact_keys(definition->'name',array['en','zh'])
     or jsonb_typeof(definition->'name'->'en') is distinct from 'string' or length(definition->'name'->>'en')=0
     or jsonb_typeof(definition->'name'->'zh') is distinct from 'string' or length(definition->'name'->>'zh')=0
 then return false; end if;
   if not coalesce(case definition->>'mode'
     when 'weight_reps' then definition->>'equipment' in ('barbell','dumbbell','machine','cable')
       and definition->>'convention'=case definition->>'equipment' when 'barbell' then 'barbell-total' when 'dumbbell' then 'per-dumbbell' else 'selected-load' end
     when 'bodyweight_reps' then definition->>'equipment'='bodyweight' and definition->>'convention'='bodyweight-repetitions'
     when 'weighted_bodyweight' then definition->>'equipment'='bodyweight' and definition->>'convention'='added-load'
     when 'assisted_bodyweight' then definition->>'equipment'='machine' and definition->>'convention'='assistance'
     when 'duration' then definition->>'equipment' in ('bodyweight','other') and definition->>'convention'='seconds'
     else false end,false) then return false; end if;
   end if;
 return true;
end $$;
commit;
