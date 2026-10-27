-- Rename the guest account and the person on a booking to client.

alter role guest rename to client;

alter table private.guest rename to client;
alter index private.guest_email_key rename to client_email_key;

alter table private.booking rename column guest_id to client_id;
alter table private.booking rename column guest_name to client_name;
alter table private.booking rename column guest_email to client_email;
alter table private.booking rename column guest_phone to client_phone;
alter index private.booking_guest_start rename to booking_client_start;
alter table private.booking rename constraint booking_guest_id_fkey to booking_client_id_fkey;

update private.client
set email = 'client@example.com'
where lower(email) = 'guest@example.com'
  and not exists (
    select 1 from private.client c where lower(c.email) = 'client@example.com'
  );

drop function private.current_guest_id(boolean);
drop function private.guest_session_token(private.client);
drop function api.guest_login(text, text);
drop function api.guest_signup(text, text, text, text);
drop function api.guest_session();
drop function api.guest_list_bookings();
drop function api.guest_cancel_booking(bigint);
drop function api.create_booking(text, bigint, timestamptz, text, text, text, text);

create function private.current_client_id(p_required boolean default true)
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  v_claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  v_id bigint;
begin
  if v_claims is null or v_claims ->> 'role' is distinct from 'client' then
    if p_required then
      raise sqlstate 'PGRST' using
        message = '{"code":"session_expired","message":"Log in again.","details":null,"hint":null}',
        detail = '{"status":401,"headers":{}}';
    end if;
    return null;
  end if;

  select c.id into v_id
  from private.client c
  where c.id = (v_claims ->> 'client_id')::bigint
    and c.token_version = (v_claims ->> 'token_version')::integer;
  if v_id is null then
    raise sqlstate 'PGRST' using
      message = '{"code":"session_expired","message":"Log in again.","details":null,"hint":null}',
      detail = '{"status":401,"headers":{}}';
  end if;
  return v_id;
end
$$;

create function private.client_session_token(p_client private.client)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_expires_at timestamptz := now() + interval '12 hours';
begin
  return jsonb_build_object(
    'token', private.sign_jwt(jsonb_build_object(
      'role', 'client',
      'client_id', p_client.id,
      'token_version', p_client.token_version,
      'exp', floor(extract(epoch from v_expires_at))::bigint
    )),
    'expires_at', v_expires_at
  );
end
$$;

create function api.create_booking(
  slug text,
  meeting_type_id bigint,
  slot_start timestamptz,
  client_name text,
  client_email text,
  client_phone text,
  intake_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slot timestamptz := slot_start;
  v_name text := btrim(coalesce(client_name, ''));
  v_email text := lower(btrim(coalesce(client_email, '')));
  v_phone text := btrim(coalesce(client_phone, ''));
  v_note text := nullif(btrim(coalesce(intake_note, '')), '');
  v_client_id bigint;
  v_meeting_type private.meeting_type;
  v_agent private.agent;
  v_candidate record;
  v_token text;
  v_booking_id bigint;
begin
  v_client_id := private.current_client_id(false);
  if v_client_id is not null then
    select c.name, lower(c.email), c.phone
    into v_name, v_email, v_phone
    from private.client c
    where c.id = v_client_id;
  end if;

  if length(v_name) not between 1 and 200 then
    return private.fail('invalid_input', 400, 'Enter your name.', 'client_name');
  end if;
  if length(v_email) not between 3 and 320 or position('@' in v_email) < 2 then
    return private.fail('invalid_input', 400, 'Enter a valid email.', 'client_email');
  end if;
  if length(v_phone) not between 1 and 40 then
    return private.fail('invalid_input', 400, 'Enter a phone number.', 'client_phone');
  end if;
  if length(v_note) > 1000 then
    return private.fail('invalid_input', 400, 'Keep the note under 1000 characters.', 'intake_note');
  end if;
  if v_slot is null then
    return private.fail('invalid_input', 400, 'Pick a time.', 'slot_start');
  end if;

  select m.* into v_meeting_type
  from private.meeting_type m
  where m.id = private.public_meeting_type_id(create_booking.slug, create_booking.meeting_type_id);
  if v_meeting_type.id is null then
    return private.fail('not_found', 404, 'Meeting type not found.');
  end if;
  select a.* into v_agent from private.agent a where a.id = v_meeting_type.agent_id;

  perform private.rate_limit('create_booking', v_email || '|' || v_agent.slug, 8, 3600);

  -- Serializes bookings and weekly-hour edits for one agent, so the check below
  -- sees every booking committed before this one.
  perform pg_catalog.pg_advisory_xact_lock(v_agent.id);

  select c.* into v_candidate
  from private.slot_candidates(v_meeting_type.id, v_slot, v_slot + interval '1 second') c
  where c.slot_start = v_slot;
  if not found then
    return private.fail('slot_not_available', 400, 'That time is no longer available.');
  end if;
  if v_candidate.busy then
    return private.fail('slot_taken', 409, 'That time was just taken.');
  end if;

  v_token := private.base64url(public.gen_random_bytes(16));
  begin
    insert into private.booking (
      agent_id, meeting_type_id, client_id, client_name, client_email, client_phone, intake_note,
      start_at, end_at, duration_minutes, buffer_before_minutes, buffer_after_minutes,
      blocked_start, blocked_end, cancel_token_hash
    )
    values (
      v_agent.id, v_meeting_type.id, v_client_id, v_name, v_email, v_phone, v_note,
      v_slot, v_candidate.slot_end, v_meeting_type.duration_minutes,
      v_meeting_type.buffer_before_minutes, v_meeting_type.buffer_after_minutes,
      v_slot - make_interval(mins => v_meeting_type.buffer_before_minutes),
      v_candidate.slot_end + make_interval(mins => v_meeting_type.buffer_after_minutes),
      pg_catalog.sha256(convert_to(v_token, 'UTF8'))
    )
    returning id into v_booking_id;
  exception
    when exclusion_violation then
      return private.fail('slot_taken', 409, 'That time was just taken.');
  end;

  return private.receipt(v_booking_id) || jsonb_build_object('cancel_token', v_token);
end
$$;

create function api.client_login(email text, password text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(email, '')));
  v_password text := coalesce(password, '');
  v_client private.client;
begin
  if v_email = '' or v_password = '' then
    return private.fail('invalid_login', 400, 'Email or password is wrong.');
  end if;

  perform private.rate_limit('login_failed', v_email, 5, 900, false);

  select c.* into v_client from private.client c where lower(c.email) = v_email;

  -- An unknown email still pays for one bcrypt comparison.
  if public.crypt(v_password, coalesce(v_client.password_hash, '$2a$10$' || repeat('x', 53)))
    is distinct from v_client.password_hash then
    perform private.rate_limit('login_failed', v_email, 5, 900);
    return private.fail('invalid_login', 400, 'Email or password is wrong.');
  end if;

  return private.client_session_token(v_client);
end
$$;

create function api.client_signup(name text, email text, phone text, password text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(name, ''));
  v_email text := lower(btrim(coalesce(email, '')));
  v_phone text := btrim(coalesce(phone, ''));
  v_password text := coalesce(password, '');
  v_client private.client;
begin
  if length(v_name) not between 1 and 200 then
    return private.fail('invalid_input', 400, 'Enter your name.', 'name');
  end if;
  if length(v_email) not between 3 and 320 or position('@' in v_email) < 2 then
    return private.fail('invalid_input', 400, 'Enter a valid email.', 'email');
  end if;
  if length(v_phone) not between 1 and 40 then
    return private.fail('invalid_input', 400, 'Enter a phone number.', 'phone');
  end if;
  if length(v_password) not between 8 and 200 then
    return private.fail('invalid_input', 400, 'Use 8 to 200 characters.', 'password');
  end if;

  begin
    insert into private.client as c (name, email, phone, password_hash)
    values (v_name, v_email, v_phone, public.crypt(v_password, public.gen_salt('bf', 10)))
    returning c.* into v_client;
  exception
    when unique_violation then
      return private.fail('email_taken', 409, 'An account with that email already exists.', 'email');
  end;

  return private.client_session_token(v_client);
end
$$;

create function api.client_session()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client_id bigint := private.current_client_id();
begin
  return (
    select jsonb_build_object(
      'client_id', c.id,
      'name', c.name,
      'email', c.email,
      'phone', c.phone
    )
    from private.client c
    where c.id = v_client_id
  );
end
$$;

create function api.client_list_bookings()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client_id bigint := private.current_client_id();
begin
  return coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'booking_id', b.id,
          'meeting_type_name', m.name,
          'duration_minutes', b.duration_minutes,
          'location', m.location,
          'slot_start', b.start_at,
          'slot_end', b.end_at,
          'intake_note', b.intake_note,
          'status', b.status,
          'agent_name', a.name,
          'brand_name', a.brand_name,
          'slug', a.slug
        )
        order by b.start_at, b.id
      )
      from private.booking b
      join private.meeting_type m on m.id = b.meeting_type_id
      join private.agent a on a.id = b.agent_id
      where b.client_id = v_client_id
    ),
    '[]'::jsonb
  );
end
$$;

create function api.client_cancel_booking(booking_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client_id bigint := private.current_client_id();
  v_booking_id bigint := booking_id;
begin
  perform private.rate_limit('client_write', v_client_id::text, 60, 60);
  if not exists (
    select 1 from private.booking b where b.id = v_booking_id and b.client_id = v_client_id
  ) then
    return private.fail('not_found', 404, 'Booking not found.');
  end if;
  update private.booking b
  set status = 'cancelled', cancelled_at = now()
  where b.id = v_booking_id and b.status = 'confirmed';
  return jsonb_build_object('status', 'cancelled');
end
$$;

create or replace function private.receipt(p_booking_id bigint)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'status', b.status,
    'slot_start', b.start_at,
    'slot_end', b.end_at,
    'meeting_type_name', m.name,
    'duration_minutes', b.duration_minutes,
    'location', m.location,
    'brand_name', a.brand_name,
    'agent_timezone', a.timezone,
    'client_name', b.client_name,
    'intake_note', b.intake_note,
    'slug', a.slug
  )
  from private.booking b
  join private.meeting_type m on m.id = b.meeting_type_id
  join private.agent a on a.id = b.agent_id
  where b.id = p_booking_id
$$;

create or replace function api.agent_list_bookings()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_agent_id bigint := private.current_agent_id();
  v_timezone text := (select a.timezone from private.agent a where a.id = v_agent_id);
begin
  return coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'booking_id', b.id,
          'meeting_type_id', b.meeting_type_id,
          'meeting_type_name', m.name,
          'duration_minutes', b.duration_minutes,
          'location', m.location,
          'slot_start', b.start_at,
          'slot_end', b.end_at,
          'client_name', b.client_name,
          'client_email', b.client_email,
          'client_phone', b.client_phone,
          'intake_note', b.intake_note,
          'status', b.status
        )
        order by b.start_at, b.id
      )
      from private.booking b
      join private.meeting_type m on m.id = b.meeting_type_id
      where b.agent_id = v_agent_id
        and b.start_at >= ((now() at time zone v_timezone)::date)::timestamp at time zone v_timezone
    ),
    '[]'::jsonb
  );
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

  -- OpenAPI and any non-RPC request stop after the global limit.
  if v_fn is null then
    return;
  end if;

  case v_fn
    -- Login. Anonymous only.
    when 'login', 'client_login' then
      perform private.require_role(v_role, array['web_anon']);
      perform private.rate_limit('ip:login', v_ip, 30, 900);

    -- Signup. Anonymous only.
    when 'client_signup' then
      perform private.require_role(v_role, array['web_anon']);
      perform private.rate_limit('ip:client_signup', v_ip, 20, 3600);

    -- Public booking page. Anonymous, or a client or agent who is already signed in.
    when 'booking_page', 'available_dates', 'available_slots' then
      perform private.require_role(v_role, array['web_anon', 'client', 'agent']);
      perform private.rate_limit('ip:public_read', v_ip, 120, 60);
    when 'create_booking' then
      perform private.require_role(v_role, array['web_anon', 'client', 'agent']);
      perform private.rate_limit('ip:create_booking', v_ip, 20, 3600);

    -- Confirmation page. The cancel token is the secret; any role may present it.
    when 'booking_by_token', 'cancel_booking' then
      perform private.require_role(v_role, array['web_anon', 'client', 'agent']);
      perform private.rate_limit('ip:booking_token', v_ip, 60, 3600);

    -- Client page.
    when 'client_session', 'client_list_bookings', 'list_booking_pages' then
      perform private.require_role(v_role, array['client']);
      perform private.rate_limit('ip:client_read', v_ip, 120, 60);
    when 'client_cancel_booking' then
      perform private.require_role(v_role, array['client']);
      perform private.rate_limit('ip:client_write', v_ip, 60, 60);

    -- Dashboard.
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

grant execute on function
  api.create_booking(text, bigint, timestamptz, text, text, text, text)
to web_anon, agent, client;

grant execute on function
  api.client_login(text, text),
  api.client_signup(text, text, text, text)
to web_anon;

grant execute on function
  api.client_session(),
  api.client_list_bookings(),
  api.client_cancel_booking(bigint)
to client;
