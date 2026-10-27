-- Every API function is SECURITY DEFINER with an empty search_path, so it reads the
-- private tables as their owner and resolves nothing through the caller.

-- Domain errors return a body and set the HTTP status instead of raising, so the
-- transaction commits and rate-limit counters from the same request are kept.
create function private.fail(p_code text, p_status integer, p_message text, p_hint text default null)
returns jsonb
language plpgsql
set search_path = ''
as $$
begin
  perform pg_catalog.set_config('response.status', p_status::text, true);
  return jsonb_build_object('code', p_code, 'message', p_message, 'details', null, 'hint', p_hint);
end
$$;

-- Fixed-window counter. With p_count false it only checks whether one more attempt
-- would go over the limit, which is how login refuses a locked email before
-- comparing the password.
create function private.rate_limit(
  p_action text,
  p_subject text,
  p_max_hits integer,
  p_window_seconds integer,
  p_count boolean default true
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_window timestamptz := pg_catalog.to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );
  v_hits integer;
begin
  if random() < 0.01 then
    delete from private.rate_bucket where window_start < now() - interval '1 day';
  end if;

  if p_count then
    insert into private.rate_bucket as b (action, subject, window_start, hits)
    values (p_action, p_subject, v_window, 1)
    on conflict (action, subject, window_start) do update set hits = b.hits + 1
    returning b.hits into v_hits;
  else
    select b.hits + 1 into v_hits
    from private.rate_bucket b
    where b.action = p_action and b.subject = p_subject and b.window_start = v_window;
    v_hits := coalesce(v_hits, 1);
  end if;

  if v_hits > p_max_hits then
    raise sqlstate 'PGRST' using
      message = json_build_object(
        'code', 'rate_limited',
        'message', 'Too many attempts. Wait a few minutes and try again.',
        'details', null,
        'hint', null
      )::text,
      detail = json_build_object(
        'status', 429,
        'headers', json_build_object(
          'Retry-After',
          ceil(extract(epoch from v_window + make_interval(secs => p_window_seconds) - now()))::text
        )
      )::text;
  end if;
end
$$;

-- PostgREST db-pre-request: one bucket per client address and endpoint group.
-- Caddy sets X-Real-IP in production; without it (local Vite) every caller is "local".
create function api.pre_request()
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
    when 'login' then
      perform private.rate_limit('ip:login', v_ip, 30, 900);
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

create function private.base64url(p_data bytea)
returns text
language sql
immutable
set search_path = ''
as $$
  select pg_catalog.translate(pg_catalog.encode(p_data, 'base64'), E'+/=\n', '-_')
$$;

create function private.sign_jwt(p_payload jsonb)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_secret text := current_setting('app.jwt_secret', true);
  v_input text;
begin
  if coalesce(length(v_secret), 0) < 32 then
    raise exception 'app.jwt_secret is missing or shorter than 32 characters';
  end if;
  v_input := private.base64url(convert_to('{"alg":"HS256","typ":"JWT"}', 'UTF8'))
    || '.' || private.base64url(convert_to(p_payload::text, 'UTF8'));
  return v_input || '.' || private.base64url(
    public.hmac(convert_to(v_input, 'UTF8'), convert_to(v_secret, 'UTF8'), 'sha256')
  );
end
$$;

-- The agent behind the request JWT. A token whose token_version no longer matches
-- the agent row is rejected, so bumping token_version ends every session.
create function private.current_agent_id()
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  v_claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  v_id bigint;
begin
  select a.id into v_id
  from private.agent a
  where a.id = (v_claims ->> 'agent_id')::bigint
    and a.token_version = (v_claims ->> 'token_version')::integer;
  if v_id is null then
    raise sqlstate 'PGRST' using
      message = '{"code":"session_expired","message":"Log in again.","details":null,"hint":null}',
      detail = '{"status":401,"headers":{}}';
  end if;
  return v_id;
end
$$;

create function private.public_meeting_type_id(p_slug text, p_meeting_type_id bigint)
returns bigint
language sql
stable
set search_path = ''
as $$
  select m.id
  from private.meeting_type m
  join private.agent a on a.id = m.agent_id
  where a.slug = lower(btrim(p_slug)) and m.id = p_meeting_type_id and m.active
$$;

-- The one slot rule. Candidates sit on the meeting type's interval grid in the agent's
-- local time, starting at local midnight, inside a weekly window, after the minimum
-- notice, and within the agent's next 60 days. busy means the candidate's range,
-- widened by this type's buffers, overlaps the blocked range of a confirmed booking:
-- the same test the booking_no_overlap constraint applies on insert.
create function private.slot_candidates(p_meeting_type_id bigint, p_from timestamptz, p_to timestamptz)
returns table (slot_start timestamptz, slot_end timestamptz, busy boolean)
language sql
stable
set search_path = ''
as $$
  with mt as (
    select m.*, a.timezone as tz, (now() at time zone a.timezone)::date as today
    from private.meeting_type m
    join private.agent a on a.id = m.agent_id
    where m.id = p_meeting_type_id
  ),
  days as (
    select mt.*, d.day
    from mt
    cross join lateral (
      select first_day + i as day
      from (
        select
          greatest((p_from at time zone mt.tz)::date, mt.today) as first_day,
          least((p_to at time zone mt.tz)::date, mt.today + 60) as last_day
      ) r
      cross join generate_series(0, r.last_day - r.first_day) as i
    ) d
  ),
  grid as (
    select
      days.*,
      w.start_local,
      w.end_local,
      days.day + make_interval(mins => k * days.slot_interval_minutes) as local_start
    from days
    join private.weekly_hour w
      on w.agent_id = days.agent_id and w.weekday = extract(dow from days.day)
    cross join generate_series(
      ceil(extract(epoch from w.start_local) / 60 / days.slot_interval_minutes)::integer,
      floor(extract(epoch from w.end_local) / 60 / days.slot_interval_minutes)::integer
    ) as k
  ),
  candidate as (
    select
      grid.*,
      grid.local_start at time zone grid.tz as s,
      (grid.local_start at time zone grid.tz) + make_interval(mins => grid.duration_minutes) as e
    from grid
  )
  select
    c.s,
    c.e,
    exists (
      select 1
      from private.booking b
      where b.agent_id = c.agent_id
        and b.status = 'confirmed'
        and tstzrange(b.blocked_start, b.blocked_end, '[)') && tstzrange(
          c.s - make_interval(mins => c.buffer_before_minutes),
          c.e + make_interval(mins => c.buffer_after_minutes),
          '[)'
        )
    )
  from candidate c
  where (c.s at time zone c.tz) = c.local_start
    and c.s >= (c.day + c.start_local) at time zone c.tz
    and c.e <= (c.day + c.end_local) at time zone c.tz
    and c.s >= now() + make_interval(mins => c.min_notice_minutes)
    and c.s >= p_from
    and c.s < p_to
  order by c.s
$$;

create function private.receipt(p_booking_id bigint)
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
    'guest_name', b.guest_name,
    'intake_note', b.intake_note,
    'slug', a.slug
  )
  from private.booking b
  join private.meeting_type m on m.id = b.meeting_type_id
  join private.agent a on a.id = b.agent_id
  where b.id = p_booking_id
$$;

create function private.meeting_type_json(p_row private.meeting_type)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'meeting_type_id', p_row.id,
    'name', p_row.name,
    'duration_minutes', p_row.duration_minutes,
    'buffer_before_minutes', p_row.buffer_before_minutes,
    'buffer_after_minutes', p_row.buffer_after_minutes,
    'location', p_row.location,
    'active', p_row.active
  )
$$;

create function private.weekly_hours_json(p_agent_id bigint)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'weekday', w.weekday,
        'start_local', to_char(w.start_local, 'HH24:MI'),
        'end_local', to_char(w.end_local, 'HH24:MI')
      )
      order by w.weekday, w.start_local
    ),
    '[]'::jsonb
  )
  from private.weekly_hour w
  where w.agent_id = p_agent_id
$$;

-- Public functions: web_anon and agent.

create function api.booking_page(slug text)
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

create function api.available_dates(
  slug text,
  meeting_type_id bigint,
  from_date date,
  to_date date,
  visitor_timezone text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meeting_type_id bigint := private.public_meeting_type_id(slug, meeting_type_id);
begin
  if v_meeting_type_id is null then
    return private.fail('not_found', 404, 'Meeting type not found.');
  end if;
  if not private.is_timezone(visitor_timezone) then
    return private.fail('invalid_input', 400, 'Unknown time zone.', 'visitor_timezone');
  end if;
  if from_date is null or to_date is null or to_date < from_date then
    return private.fail('invalid_input', 400, 'from_date must not be after to_date.', 'to_date');
  end if;
  if to_date - from_date >= 42 then
    return private.fail('out_of_range', 400, 'Ask for at most 42 days at a time.');
  end if;

  return coalesce(
    (
      select jsonb_agg(
        distinct to_char(c.slot_start at time zone visitor_timezone, 'YYYY-MM-DD')
        order by to_char(c.slot_start at time zone visitor_timezone, 'YYYY-MM-DD')
      )
      from private.slot_candidates(
        v_meeting_type_id,
        from_date::timestamp at time zone visitor_timezone,
        (to_date + 1)::timestamp at time zone visitor_timezone
      ) c
      where not c.busy
    ),
    '[]'::jsonb
  );
end
$$;

create function api.available_slots(slug text, meeting_type_id bigint, on_date date, visitor_timezone text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meeting_type_id bigint := private.public_meeting_type_id(slug, meeting_type_id);
begin
  if v_meeting_type_id is null then
    return private.fail('not_found', 404, 'Meeting type not found.');
  end if;
  if not private.is_timezone(visitor_timezone) then
    return private.fail('invalid_input', 400, 'Unknown time zone.', 'visitor_timezone');
  end if;
  if on_date is null then
    return private.fail('invalid_input', 400, 'Pick a date.', 'on_date');
  end if;

  return coalesce(
    (
      select jsonb_agg(
        jsonb_build_object('slot_start', c.slot_start, 'slot_end', c.slot_end)
        order by c.slot_start
      )
      from private.slot_candidates(
        v_meeting_type_id,
        on_date::timestamp at time zone visitor_timezone,
        (on_date + 1)::timestamp at time zone visitor_timezone
      ) c
      where not c.busy
    ),
    '[]'::jsonb
  );
end
$$;

create function api.create_booking(
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
  v_meeting_type private.meeting_type;
  v_agent private.agent;
  v_candidate record;
  v_token text;
  v_booking_id bigint;
begin
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
      agent_id, meeting_type_id, guest_name, guest_email, guest_phone, intake_note,
      start_at, end_at, duration_minutes, buffer_before_minutes, buffer_after_minutes,
      blocked_start, blocked_end, cancel_token_hash
    )
    values (
      v_agent.id, v_meeting_type.id, v_name, v_email, v_phone, v_note,
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

create function api.booking_by_token(token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash bytea := pg_catalog.sha256(convert_to(coalesce(token, ''), 'UTF8'));
  v_booking_id bigint;
begin
  perform private.rate_limit('booking_token', encode(v_hash, 'hex'), 10, 3600);
  select b.id into v_booking_id from private.booking b where b.cancel_token_hash = v_hash;
  if v_booking_id is null then
    return private.fail('not_found', 404, 'Booking not found.');
  end if;
  return private.receipt(v_booking_id);
end
$$;

create function api.cancel_booking(token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash bytea := pg_catalog.sha256(convert_to(coalesce(token, ''), 'UTF8'));
  v_booking_id bigint;
begin
  perform private.rate_limit('booking_token', encode(v_hash, 'hex'), 10, 3600);
  select b.id into v_booking_id from private.booking b where b.cancel_token_hash = v_hash;
  if v_booking_id is null then
    return private.fail('not_found', 404, 'Booking not found.');
  end if;
  update private.booking b
  set status = 'cancelled', cancelled_at = now()
  where b.id = v_booking_id and b.status = 'confirmed';
  return jsonb_build_object('status', 'cancelled');
end
$$;

-- Anonymous only.

create function api.login(email text, password text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(email, '')));
  v_password text := coalesce(password, '');
  v_agent private.agent;
  v_expires_at timestamptz := now() + interval '12 hours';
begin
  if v_email = '' or v_password = '' then
    return private.fail('invalid_login', 400, 'Email or password is wrong.');
  end if;

  perform private.rate_limit('login_failed', v_email, 5, 900, false);

  select a.* into v_agent from private.agent a where lower(a.email) = v_email;

  -- An unknown email still pays for one bcrypt comparison.
  if public.crypt(v_password, coalesce(v_agent.password_hash, '$2a$10$' || repeat('x', 53)))
    is distinct from v_agent.password_hash then
    perform private.rate_limit('login_failed', v_email, 5, 900);
    return private.fail('invalid_login', 400, 'Email or password is wrong.');
  end if;

  return jsonb_build_object(
    'token', private.sign_jwt(jsonb_build_object(
      'role', 'agent',
      'agent_id', v_agent.id,
      'token_version', v_agent.token_version,
      'exp', floor(extract(epoch from v_expires_at))::bigint
    )),
    'expires_at', v_expires_at
  );
end
$$;

-- Agent only. Each function resolves the agent from the JWT.

create function api.agent_session()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_agent_id bigint := private.current_agent_id();
begin
  return (
    select jsonb_build_object(
      'agent_id', a.id,
      'name', a.name,
      'email', a.email,
      'slug', a.slug,
      'timezone', a.timezone,
      'brand_name', a.brand_name
    )
    from private.agent a
    where a.id = v_agent_id
  );
end
$$;

create function api.agent_list_bookings()
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
          'guest_name', b.guest_name,
          'guest_email', b.guest_email,
          'guest_phone', b.guest_phone,
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

create function api.agent_cancel_booking(booking_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_agent_id bigint := private.current_agent_id();
  v_booking_id bigint := booking_id;
begin
  perform private.rate_limit('agent_write', v_agent_id::text, 60, 60);
  if not exists (
    select 1 from private.booking b where b.id = v_booking_id and b.agent_id = v_agent_id
  ) then
    return private.fail('not_found', 404, 'Booking not found.');
  end if;
  update private.booking b
  set status = 'cancelled', cancelled_at = now()
  where b.id = v_booking_id and b.status = 'confirmed';
  return jsonb_build_object('status', 'cancelled');
end
$$;

create function api.agent_list_weekly_hours()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return private.weekly_hours_json(private.current_agent_id());
end
$$;

-- hours is the whole week: [{ "weekday": 1, "start_local": "09:00", "end_local": "17:00" }, ...]
create function api.agent_replace_weekly_hours(hours jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_agent_id bigint := private.current_agent_id();
  v_hours jsonb := hours;
begin
  perform private.rate_limit('agent_write', v_agent_id::text, 60, 60);
  if jsonb_typeof(v_hours) is distinct from 'array' then
    return private.fail('invalid_input', 400, 'Send the week as a list.', 'hours');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(v_agent_id);
  begin
    delete from private.weekly_hour w where w.agent_id = v_agent_id;
    insert into private.weekly_hour (agent_id, weekday, start_local, end_local)
    select v_agent_id, x.weekday, x.start_local::time, x.end_local::time
    from jsonb_to_recordset(v_hours) as x (weekday smallint, start_local text, end_local text);
  exception
    when check_violation or exclusion_violation or not_null_violation or invalid_parameter_value
      or invalid_datetime_format or datetime_field_overflow or invalid_text_representation
      or numeric_value_out_of_range then
      return private.fail(
        'invalid_input', 400, 'Each day needs a start before its end, with no overlaps.', 'hours'
      );
  end;

  return private.weekly_hours_json(v_agent_id);
end
$$;

create function api.agent_list_meeting_types()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_agent_id bigint := private.current_agent_id();
begin
  return coalesce(
    (
      select jsonb_agg(private.meeting_type_json(m) order by m.id)
      from private.meeting_type m
      where m.agent_id = v_agent_id
    ),
    '[]'::jsonb
  );
end
$$;

-- meeting_type_id null creates a type. Slot interval and minimum notice keep their defaults.
create function api.agent_upsert_meeting_type(
  meeting_type_id bigint,
  name text,
  duration_minutes integer,
  buffer_before_minutes integer,
  buffer_after_minutes integer,
  location text,
  active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_agent_id bigint := private.current_agent_id();
  v_id bigint := meeting_type_id;
  v_name text := btrim(coalesce(name, ''));
  v_duration integer := duration_minutes;
  v_before integer := coalesce(buffer_before_minutes, 0);
  v_after integer := coalesce(buffer_after_minutes, 0);
  v_location text := location;
  v_active boolean := coalesce(active, true);
  v_row private.meeting_type;
begin
  perform private.rate_limit('agent_write', v_agent_id::text, 60, 60);
  if length(v_name) not between 1 and 120 then
    return private.fail('invalid_input', 400, 'Enter a name.', 'name');
  end if;
  if v_duration is null or v_duration not between 5 and 480 then
    return private.fail('invalid_input', 400, 'Duration is 5 to 480 minutes.', 'duration_minutes');
  end if;
  if v_before not between 0 and 240 then
    return private.fail('invalid_input', 400, 'Buffers are 0 to 240 minutes.', 'buffer_before_minutes');
  end if;
  if v_after not between 0 and 240 then
    return private.fail('invalid_input', 400, 'Buffers are 0 to 240 minutes.', 'buffer_after_minutes');
  end if;
  if v_location is null or v_location not in ('in_person', 'video', 'phone') then
    return private.fail('invalid_input', 400, 'Pick a location.', 'location');
  end if;

  if v_id is null then
    insert into private.meeting_type as m (
      agent_id, name, duration_minutes, buffer_before_minutes, buffer_after_minutes, location, active
    )
    values (v_agent_id, v_name, v_duration, v_before, v_after, v_location, v_active)
    returning m.* into v_row;
  else
    update private.meeting_type m
    set name = v_name,
        duration_minutes = v_duration,
        buffer_before_minutes = v_before,
        buffer_after_minutes = v_after,
        location = v_location,
        active = v_active
    where m.id = v_id and m.agent_id = v_agent_id
    returning m.* into v_row;
    if v_row.id is null then
      return private.fail('not_found', 404, 'Meeting type not found.');
    end if;
  end if;

  return private.meeting_type_json(v_row);
end
$$;

grant execute on function
  api.pre_request(),
  api.booking_page(text),
  api.available_dates(text, bigint, date, date, text),
  api.available_slots(text, bigint, date, text),
  api.create_booking(text, bigint, timestamptz, text, text, text, text),
  api.booking_by_token(text),
  api.cancel_booking(text)
to web_anon, agent;

grant execute on function api.login(text, text) to web_anon;

grant execute on function
  api.agent_session(),
  api.agent_list_bookings(),
  api.agent_cancel_booking(bigint),
  api.agent_list_weekly_hours(),
  api.agent_replace_weekly_hours(jsonb),
  api.agent_list_meeting_types(),
  api.agent_upsert_meeting_type(bigint, text, integer, integer, integer, text, boolean)
to agent;
