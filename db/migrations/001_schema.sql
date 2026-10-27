create extension if not exists btree_gist;
create extension if not exists pgcrypto;

do $$
begin
  if not exists (select from pg_roles where rolname = 'web_anon') then
    create role web_anon nologin;
  end if;
  if not exists (select from pg_roles where rolname = 'agent') then
    create role agent nologin;
  end if;
  if not exists (select from pg_roles where rolname = 'authenticator') then
    create role authenticator login noinherit;
  end if;
end
$$;

grant web_anon, agent to authenticator;
alter role authenticator set statement_timeout = '8s';
alter role authenticator set timezone = 'UTC';

alter default privileges revoke execute on functions from public;

create schema private;
create schema api;
grant usage on schema api to web_anon, agent;

create function private.is_timezone(p_name text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from pg_catalog.pg_timezone_names where name = p_name)
$$;

create table private.agent (
  id bigint generated always as identity primary key,
  name text not null,
  email text not null,
  password_hash text not null,
  timezone text not null check (private.is_timezone(timezone)),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  brand_name text not null,
  token_version integer not null default 1,
  created_at timestamptz not null default now()
);

create unique index agent_email_key on private.agent (lower(email));

create table private.meeting_type (
  id bigint generated always as identity primary key,
  agent_id bigint not null references private.agent (id),
  name text not null check (length(name) between 1 and 120),
  duration_minutes integer not null check (duration_minutes between 5 and 480),
  buffer_before_minutes integer not null default 0 check (buffer_before_minutes between 0 and 240),
  buffer_after_minutes integer not null default 0 check (buffer_after_minutes between 0 and 240),
  slot_interval_minutes integer not null default 30 check (slot_interval_minutes between 5 and 240),
  min_notice_minutes integer not null default 60 check (min_notice_minutes between 0 and 10080),
  location text not null check (location in ('in_person', 'video', 'phone')),
  active boolean not null default true,
  unique (agent_id, id)
);

create table private.weekly_hour (
  agent_id bigint not null references private.agent (id),
  weekday smallint not null check (weekday between 0 and 6),
  start_local time not null,
  end_local time not null check (end_local > start_local),
  exclude using gist (
    agent_id with =,
    weekday with =,
    tsrange(date '2000-01-01' + start_local, date '2000-01-01' + end_local) with &&
  )
);

create table private.booking (
  id bigint generated always as identity primary key,
  agent_id bigint not null,
  meeting_type_id bigint not null,
  guest_name text not null,
  guest_email text not null,
  guest_phone text not null,
  intake_note text,
  start_at timestamptz not null,
  end_at timestamptz not null,
  duration_minutes integer not null,
  buffer_before_minutes integer not null,
  buffer_after_minutes integer not null,
  blocked_start timestamptz not null,
  blocked_end timestamptz not null,
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  cancel_token_hash bytea not null unique,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  foreign key (agent_id, meeting_type_id) references private.meeting_type (agent_id, id),
  check (end_at > start_at),
  check (blocked_start <= start_at and blocked_end >= end_at),
  constraint booking_no_overlap exclude using gist (
    agent_id with =,
    tstzrange(blocked_start, blocked_end, '[)') with &&
  ) where (status = 'confirmed')
);

create index booking_agent_start on private.booking (agent_id, start_at);

create table private.rate_bucket (
  action text not null,
  subject text not null,
  window_start timestamptz not null,
  hits integer not null,
  primary key (action, subject, window_start)
);

create index rate_bucket_window_start on private.rate_bucket (window_start);
