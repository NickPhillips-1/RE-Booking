create function private.require_role(p_role text, p_allowed text[])
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_role = any (p_allowed) then
    return;
  end if;
  if p_role = 'web_anon' then
    raise sqlstate 'PGRST' using
      message = '{"code":"session_expired","message":"Log in again.","details":null,"hint":null}',
      detail = '{"status":401,"headers":{}}';
  end if;
  raise sqlstate 'PGRST' using
    message = '{"code":"forbidden","message":"You do not have access to this.","details":null,"hint":null}',
    detail = '{"status":403,"headers":{}}';
end
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
  v_role text := coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    'web_anon'
  );
begin
  perform private.rate_limit('ip:all', v_ip, 300, 60);

  if v_fn is null then
    return;
  end if;

  case v_fn
    when 'login', 'guest_login' then
      perform private.require_role(v_role, array['web_anon']);
      perform private.rate_limit('ip:login', v_ip, 30, 900);

    when 'guest_signup' then
      perform private.require_role(v_role, array['web_anon']);
      perform private.rate_limit('ip:guest_signup', v_ip, 20, 3600);

    when 'booking_page', 'available_dates', 'available_slots' then
      perform private.require_role(v_role, array['web_anon', 'guest', 'agent']);
      perform private.rate_limit('ip:public_read', v_ip, 120, 60);
    when 'create_booking' then
      perform private.require_role(v_role, array['web_anon', 'guest', 'agent']);
      perform private.rate_limit('ip:create_booking', v_ip, 20, 3600);

    when 'booking_by_token', 'cancel_booking' then
      perform private.require_role(v_role, array['web_anon', 'guest', 'agent']);
      perform private.rate_limit('ip:booking_token', v_ip, 60, 3600);

    when 'guest_session', 'guest_list_bookings', 'list_booking_pages' then
      perform private.require_role(v_role, array['guest']);
      perform private.rate_limit('ip:guest_read', v_ip, 120, 60);
    when 'guest_cancel_booking' then
      perform private.require_role(v_role, array['guest']);
      perform private.rate_limit('ip:guest_write', v_ip, 60, 60);

    when 'agent_session', 'agent_list_bookings', 'agent_list_weekly_hours', 'agent_list_meeting_types' then
      perform private.require_role(v_role, array['agent']);
      perform private.rate_limit('ip:agent_read', v_ip, 120, 60);
    when 'agent_cancel_booking', 'agent_replace_weekly_hours', 'agent_upsert_meeting_type' then
      perform private.require_role(v_role, array['agent']);
      perform private.rate_limit('ip:agent_write', v_ip, 60, 60);

    else
      raise sqlstate 'PGRST' using
        message = '{"code":"not_found","message":"Not found.","details":null,"hint":null}',
        detail = '{"status":404,"headers":{}}';
  end case;
end
$$;

revoke execute on function api.list_booking_pages() from web_anon, agent;
