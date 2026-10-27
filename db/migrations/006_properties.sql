create table private.property (
  id bigint generated always as identity primary key,
  agent_id bigint not null references private.agent (id) on delete cascade,
  address text not null
);

create unique index property_agent_address_key
  on private.property (agent_id, lower(address));

create or replace function api.booking_page(slug text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_agent private.agent;
begin
  select a.* into v_agent from private.agent a where a.slug = lower(btrim(booking_page.slug));
  if v_agent.id is null then
    return null;
  end if;
  return jsonb_build_object(
    'slug', v_agent.slug,
    'brand_name', v_agent.brand_name,
    'agent_name', v_agent.name,
    'timezone', v_agent.timezone,
    'has_hours', exists (select 1 from private.weekly_hour w where w.agent_id = v_agent.id),
    'properties', coalesce(
      (
        select jsonb_agg(p.address order by p.address)
        from private.property p
        where p.agent_id = v_agent.id
      ),
      '[]'::jsonb
    ),
    'meeting_types', coalesce(
      (
        select jsonb_agg(private.meeting_type_json(m) - 'active' order by m.id)
        from private.meeting_type m
        where m.agent_id = v_agent.id and m.active
      ),
      '[]'::jsonb
    )
  );
end
$$;
