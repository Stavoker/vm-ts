-- Requirements Check feature schema (safe to re-run)

do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'requirement_scan_status' and n.nspname = 'public'
  ) then
    create type public.requirement_scan_status as enum (
      'pending',
      'discovering',
      'running',
      'paused_for_user',
      'generating_report',
      'completed',
      'failed',
      'cancelled'
    );
  end if;

  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'requirement_result_status' and n.nspname = 'public'
  ) then
    create type public.requirement_result_status as enum ('PASS', 'MANUAL', 'FAIL');
  end if;
end $$;

create table if not exists public.requirement_check_sessions (
  id uuid primary key default gen_random_uuid(),
  website_url text not null,
  hostname text not null,
  status public.requirement_scan_status not null default 'pending',
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  overall_score integer,
  automation_coverage integer,
  total_requirements integer not null default 0,
  passed_requirements integer not null default 0,
  manual_requirements integer not null default 0,
  failed_requirements integer not null default 0,
  discovered_pages integer not null default 0,
  checked_pages integer not null default 0,
  current_page text,
  current_action text,
  duration_ms integer,
  error_message text,
  login_page_url text,
  has_credentials boolean not null default false,
  progress_percent integer not null default 0,
  latest_screenshot_path text,
  pause_reason text
);

create table if not exists public.requirement_check_results (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.requirement_check_sessions (id) on delete cascade,
  requirement_id text not null,
  requirement_name text not null,
  requirement_category text not null,
  requirement_sub_category text not null,
  requirement_type text not null,
  weight numeric not null default 1,
  status public.requirement_result_status not null,
  explanation text not null,
  checked_url text,
  evidence jsonb,
  confidence numeric,
  handler_used text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (session_id, requirement_id)
);

create table if not exists public.requirement_discovered_pages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.requirement_check_sessions (id) on delete cascade,
  url text not null,
  page_type text not null default 'unknown',
  http_status integer,
  title text,
  checked boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.requirement_check_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.requirement_check_sessions (id) on delete cascade,
  event_type text not null,
  message text not null,
  payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists requirement_check_sessions_created_at_idx
  on public.requirement_check_sessions (created_at desc);

create index if not exists requirement_check_results_session_idx
  on public.requirement_check_results (session_id, requirement_category, requirement_sub_category);

create index if not exists requirement_check_events_session_created_idx
  on public.requirement_check_events (session_id, created_at);

alter table public.requirement_check_sessions enable row level security;
alter table public.requirement_check_results enable row level security;
alter table public.requirement_discovered_pages enable row level security;
alter table public.requirement_check_events enable row level security;

drop policy if exists "requirement_check_sessions_all" on public.requirement_check_sessions;
create policy "requirement_check_sessions_all" on public.requirement_check_sessions
  for all using (true) with check (true);

drop policy if exists "requirement_check_results_all" on public.requirement_check_results;
create policy "requirement_check_results_all" on public.requirement_check_results
  for all using (true) with check (true);

drop policy if exists "requirement_discovered_pages_all" on public.requirement_discovered_pages;
create policy "requirement_discovered_pages_all" on public.requirement_discovered_pages
  for all using (true) with check (true);

drop policy if exists "requirement_check_events_all" on public.requirement_check_events;
create policy "requirement_check_events_all" on public.requirement_check_events
  for all using (true) with check (true);
