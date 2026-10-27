create function api.list_booking_pages()
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

create or replace function api.pre_request()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fn text := substring(current_setting('request.path', true) from '^/rpc/([a-z_]+)$');
  v_ip text := coalesce(
    nullif(btrim(current_setting('request.headers', true)::json ->> 'x-real-ip'), ''),
    'local'
  );
begin
  case v_fn
    when 'login', 'guest_login' then
      perform private.rate_limit('ip:login', v_ip, 30, 900);
    when 'guest_signup' then
      perform private.rate_limit('ip:guest_signup', v_ip, 20, 3600);
    when 'create_booking' then
      perform private.rate_limit('ip:create_booking', v_ip, 20, 3600);
    when 'cancel_booking', 'booking_by_token' then
      perform private.rate_limit('ip:booking_token', v_ip, 60, 3600);
    when 'available_slots', 'available_dates', 'booking_page', 'list_booking_pages' then
      perform private.rate_limit('ip:public_read', v_ip, 120, 60);
    else
      null;
  end case;
end
$$;

grant execute on function api.list_booking_pages() to web_anon, agent, guest;
