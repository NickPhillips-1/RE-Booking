-- PostgREST runs STABLE functions in a read-only transaction. pre_request
-- writes a rate-limit row, so this has to be a regular function.

create or replace function api.list_booking_pages()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'slug', a.slug,
          'brand_name', a.brand_name,
          'agent_name', a.name
        )
        order by a.brand_name
      )
      from private.agent a
      where exists (select 1 from private.weekly_hour w where w.agent_id = a.id)
        and exists (select 1 from private.meeting_type m where m.agent_id = a.id and m.active)
    ),
    '[]'::jsonb
  );
$$;
