-- Remove the retired internal work-coordination schema and its public RPC wrappers.

drop function if exists public.control_plane_list_members();
drop function if exists public.control_plane_list_work_items();
drop function if exists public.control_plane_create_work_item(text, uuid, timestamptz, text[], text[]);
drop function if exists public.control_plane_assign_work_item(uuid, uuid, timestamptz);
drop function if exists public.control_plane_transition_work_item(uuid, text);
drop schema if exists control_plane cascade;
