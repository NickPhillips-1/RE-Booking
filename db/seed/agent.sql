begin;

with created as (
  insert into private.agent (name, email, password_hash, timezone, slug, brand_name)
  values (
    :'name',
    lower(:'email'),
    public.crypt(:'password', public.gen_salt('bf', 10)),
    :'timezone',
    lower(:'slug'),
    :'brand_name'
  )
  on conflict (slug) do nothing
  returning id
),
hours as (
  insert into private.weekly_hour (agent_id, weekday, start_local, end_local)
  select created.id, weekday, '09:00', '17:00'
  from created, generate_series(1, 5) as weekday
)
insert into private.meeting_type (agent_id, name, duration_minutes, buffer_after_minutes, location)
select created.id, t.name, t.duration_minutes, t.buffer_after_minutes, t.location
from created, (
  values
    ('Consultation', 30, 0, 'video'),
    ('Showing', 60, 15, 'in_person')
) as t (name, duration_minutes, buffer_after_minutes, location);

insert into private.property (agent_id, address)
select a.id, t.address
from private.agent a
join (
  values
    ('12 Oak Street'),
    ('48 Maple Avenue'),
    ('210 River Road')
) as t (address) on true
where a.slug = lower(:'slug')
on conflict do nothing;

update private.agent
set password_hash = public.crypt(:'password', public.gen_salt('bf', 10)),
    token_version = token_version + 1
where slug = lower(:'slug')
  and password_hash <> public.crypt(:'password', password_hash);

commit;
