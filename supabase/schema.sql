-- Safe to re-run: creates only what is missing.

create extension if not exists "pgcrypto";

do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'site_status' and n.nspname = 'public'
  ) then
    create type public.site_status as enum (
      'online',
      'offline',
      'payment_required',
      'blocked',
      'error'
    );
  end if;
end $$;

create table if not exists public.sites (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  url text not null unique,
  status public.site_status not null default 'offline',
  status_reason text,
  http_status integer,
  response_time_ms integer,
  last_checked_at timestamptz,
  last_online_at timestamptz,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.site_checks (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete cascade,
  status public.site_status not null,
  http_status integer,
  response_time_ms integer,
  status_reason text,
  notified boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.telegram_chats (
  chat_id text primary key,
  username text,
  first_name text,
  activated_at timestamptz not null default now()
);

create index if not exists sites_status_idx on public.sites (status);
create index if not exists sites_is_active_idx on public.sites (is_active);
create index if not exists site_checks_site_id_created_at_idx
  on public.site_checks (site_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists sites_set_updated_at on public.sites;
create trigger sites_set_updated_at
before update on public.sites
for each row execute function public.set_updated_at();

alter table public.sites enable row level security;
alter table public.site_checks enable row level security;
alter table public.telegram_chats enable row level security;

drop policy if exists "sites_all" on public.sites;
create policy "sites_all" on public.sites
  for all using (true) with check (true);

drop policy if exists "site_checks_all" on public.site_checks;
create policy "site_checks_all" on public.site_checks
  for all using (true) with check (true);

drop policy if exists "telegram_chats_all" on public.telegram_chats;
create policy "telegram_chats_all" on public.telegram_chats
  for all using (true) with check (true);
