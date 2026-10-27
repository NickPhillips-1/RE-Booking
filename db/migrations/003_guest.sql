-- Guest accounts. A guest logs in with email and password, the same way an
-- agent does, and gets a JWT whose role is guest. Appointments they book while
-- that session is active store guest_id. Anonymous bookings leave it null.

do $$
begin
  if not exists (select from pg_roles where rolname = 'guest') then
    create role guest nologin;
  end if;
end
$$;

grant guest to authenticator;
grant usage on schema api to guest;

create table private.guest (
  id bigint generated always as identity primary key,
  name text not null,
  email text not null,
  phone text not null,
  password_hash text not null,
  token_version integer not null default 1,
  created_at timestamptz not null default now()
);

create unique index guest_email_key on private.guest (lower(email));

alter table private.booking
  add column guest_id bigint references private.guest (id);

create index booking_guest_start on private.booking (guest_id, start_at);

-- p_required false is the booking page: no guest session means an anonymous
-- visit. A guest token whose token_version no longer matches still fails,
-- so a logged-out session cannot be saved as if nobody was signed in.
create function private.current_guest_id(p_required boolean default true)
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  v_claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  v_id bigint;
begin
  if v_claims is null or v_claims ->> 'role' is distinct from 'guest' then
    if p_required then
      raise sqlstate 'PGRST' using
        message = '{"code":"session_expired","message":"Log in again.","details":null,"hint":null}',
        detail = '{"status":401,"headers":{}}';
    end if;
    return null;
  end if;

  select g.id into v_id
  from private.guest g
  where g.id = (v_claims ->> 'guest_id')::bigint
    and g.token_version = (v_claims ->> 'token_version')::integer;
  if v_id is null then
    raise sqlstate 'PGRST' using
      message = '{"code":"session_expired","message":"Log in again.","details":null,"hint":null}',
      detail = '{"status":401,"headers":{}}';
  end if;
  return v_id;
end
$$;

create function private.guest_session_token(p_guest private.guest)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_expires_at timestamptz := now() + interval '12 hours';
begin
  return jsonb_build_object(
    'token', private.sign_jwt(jsonb_build_object(
      'role', 'guest',
      'guest_id', p_guest.id,
      'token_version', p_guest.token_version,
      'exp', floor(extract(epoch from v_expires_at))::bigint
    )),
    'expires_at', v_expires_at
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
    when 'available_slots', 'available_dates', 'booking_page' then
      perform private.rate_limit('ip:public_read', v_ip, 120, 60);
    else
      null;
  end case;
end
$$;

create or replace function api.create_booking(
  slug text,
  meeting_type_id bigint,
  slot_start timestamptz,
  guest_name text,
  guest_email text,
  guest_phone text,
  intake_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slot timestamptz := slot_start;
  v_name text := btrim(coalesce(guest_name, ''));
  v_email text := lower(btrim(coalesce(guest_email, '')));
  v_phone text := btrim(coalesce(guest_phone, ''));
  v_note text := nullif(btrim(coalesce(intake_note, '')), '');
  v_guest_id bigint;
  v_meeting_type private.meeting_type;
  v_agent private.agent;
  v_candidate record;
  v_token text;
  v_booking_id bigint;
begin
  v_guest_id := private.current_guest_id(false);
  if v_guest_id is not null then
    select g.name, lower(g.email), g.phone
    into v_name, v_email, v_phone
    from private.guest g
    where g.id = v_guest_id;
  end if;

  if length(v_name) not between 1 and 200 then
    return private.fail('invalid_input', 400, 'Enter your name.', 'guest_name');
  end if;
  if length(v_email) not between 3 and 320 or position('@' in v_email) < 2 then
    return private.fail('invalid_input', 400, 'Enter a valid email.', 'guest_email');
  end if;
  if length(v_phone) not between 1 and 40 then
    return private.fail('invalid_input', 400, 'Enter a phone number.', 'guest_phone');
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
      agent_id, meeting_type_id, guest_id, guest_name, guest_email, guest_phone, intake_note,
      start_at, end_at, duration_minutes, buffer_before_minutes, buffer_after_minutes,
      blocked_start, blocked_end, cancel_token_hash
    )
    values (
      v_agent.id, v_meeting_type.id, v_guest_id, v_name, v_email, v_phone, v_note,
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

-- Anonymous only.

create function api.guest_login(email text, password text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(email, '')));
  v_password text := coalesce(password, '');
  v_guest private.guest;
begin
  if v_email = '' or v_password = '' then
    return private.fail('invalid_login', 400, 'Email or password is wrong.');
  end if;

  perform private.rate_limit('login_failed', v_email, 5, 900, false);

  select g.* into v_guest from private.guest g where lower(g.email) = v_email;

  -- An unknown email still pays for one bcrypt comparison.
  if public.crypt(v_password, coalesce(v_guest.password_hash, '$2a$10$' || repeat('x', 53)))
    is distinct from v_guest.password_hash then
    perform private.rate_limit('login_failed', v_email, 5, 900);
    return private.fail('invalid_login', 400, 'Email or password is wrong.');
  end if;

  return private.guest_session_token(v_guest);
end
$$;

create function api.guest_signup(name text, email text, phone text, password text)
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
  v_guest private.guest;
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
    insert into private.guest as g (name, email, phone, password_hash)
    values (v_name, v_email, v_phone, public.crypt(v_password, public.gen_salt('bf', 10)))
    returning g.* into v_guest;
  exception
    when unique_violation then
      return private.fail('email_taken', 409, 'An account with that email already exists.', 'email');
  end;

  return private.guest_session_token(v_guest);
end
$$;

-- Guest only.

create function api.guest_session()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_guest_id bigint := private.current_guest_id();
begin
  return (
    select jsonb_build_object(
      'guest_id', g.id,
      'name', g.name,
      'email', g.email,
      'phone', g.phone
    )
    from private.guest g
    where g.id = v_guest_id
  );
end
$$;

create function api.guest_list_bookings()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_guest_id bigint := private.current_guest_id();
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
      where b.guest_id = v_guest_id
    ),
    '[]'::jsonb
  );
end
$$;

create function api.guest_cancel_booking(booking_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_guest_id bigint := private.current_guest_id();
  v_booking_id bigint := booking_id;
begin
  perform private.rate_limit('guest_write', v_guest_id::text, 60, 60);
  if not exists (
    select 1 from private.booking b where b.id = v_booking_id and b.guest_id = v_guest_id
  ) then
    return private.fail('not_found', 404, 'Booking not found.');
  end if;
  update private.booking b
  set status = 'cancelled', cancelled_at = now()
  where b.id = v_booking_id and b.status = 'confirmed';
  return jsonb_build_object('status', 'cancelled');
end
$$;

grant execute on function api.pre_request() to guest;

grant execute on function
  api.booking_page(text),
  api.available_dates(text, bigint, date, date, text),
  api.available_slots(text, bigint, date, text),
  api.create_booking(text, bigint, timestamptz, text, text, text, text),
  api.booking_by_token(text),
  api.cancel_booking(text)
to guest;

grant execute on function
  api.guest_login(text, text),
  api.guest_signup(text, text, text, text)
to web_anon;

grant execute on function
  api.guest_session(),
  api.guest_list_bookings(),
  api.guest_cancel_booking(bigint)
to guest;
