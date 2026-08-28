-- Requirement definitions registry (canonical Master Check List in DB)
-- Safe to re-run. Run AFTER requirements_check.sql (or on existing production DB).

do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'requirement_definition_type' and n.nspname = 'public'
  ) then
    create type public.requirement_definition_type as enum (
      'AUTOMATED',
      'AUTHENTICATED',
      'AI_REVIEW',
      'EXTERNAL_DATA',
      'HYBRID',
      'MANUAL_ONLY'
    );
  end if;
end $$;

create table if not exists public.requirement_definitions (
  id text primary key,
  original_name text not null,
  display_name text not null,
  original_description text not null default '',
  category text not null,
  sub_category text not null default '',
  requirement_type public.requirement_definition_type not null,
  weight numeric not null default 1,
  severity text not null default 'medium',
  enabled boolean not null default true,
  sort_order integer not null,
  handler_key text not null,
  manual_instructions text not null default '',
  evidence_requirements jsonb not null default '[]'::jsonb,
  config jsonb not null default '{}'::jsonb,
  source_reference text not null
    default 'Master_check_list_for_Website_creation_and_company_onboarding',
  source_section text not null default '',
  source_row integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists requirement_definitions_category_sort_idx
  on public.requirement_definitions (category, sort_order);

create index if not exists requirement_definitions_enabled_idx
  on public.requirement_definitions (enabled)
  where enabled = true;

create index if not exists requirement_definitions_type_idx
  on public.requirement_definitions (requirement_type);

create index if not exists requirement_definitions_source_section_idx
  on public.requirement_definitions (source_section);

drop trigger if exists requirement_definitions_set_updated_at on public.requirement_definitions;
create trigger requirement_definitions_set_updated_at
before update on public.requirement_definitions
for each row execute function public.set_updated_at();

alter table public.requirement_definitions enable row level security;

drop policy if exists "requirement_definitions_select" on public.requirement_definitions;
create policy "requirement_definitions_select" on public.requirement_definitions
  for select using (true);

-- Writes are performed via service role / SQL migrations only (no public insert/update/delete policy).

-- Seed all Master Check List requirements.
-- Run this file AFTER supabase/requirement_definitions.sql
-- Regenerate with: npm run requirements:seed