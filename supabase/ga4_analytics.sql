-- GA4 Traffic Analytics: extend sites + store weekly PDF reports.
-- Safe to re-run.

alter table public.sites
  add column if not exists ga4_property_id text,
  add column if not exists ga4_measurement_id text,
  add column if not exists ga4_enabled boolean not null default false;

create table if not exists public.analytics_reports (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete cascade,
  report_type text not null default 'weekly',
  period_start date not null,
  period_end date not null,
  file_name text,
  pdf_base64 text,
  generated_at timestamptz,
  generated_by text,
  status text not null default 'pending',
  error_message text,
  metadata_json jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_id, period_start, period_end, report_type)
);

create index if not exists analytics_reports_site_generated_idx
  on public.analytics_reports (site_id, generated_at desc);

drop trigger if exists analytics_reports_set_updated_at on public.analytics_reports;
create trigger analytics_reports_set_updated_at
before update on public.analytics_reports
for each row execute function public.set_updated_at();

alter table public.analytics_reports enable row level security;

drop policy if exists "analytics_reports_all" on public.analytics_reports;
create policy "analytics_reports_all" on public.analytics_reports
  for all using (true) with check (true);

update public.sites
set
  ga4_property_id = '553049536',
  ga4_measurement_id = 'G-Z5SJQL9S93',
  ga4_enabled = true
where id = '861fcac0-596c-4693-9920-8c1e81ceb942'
   or name ilike 'Horizon Skill';

update public.sites
set
  ga4_property_id = '553081819',
  ga4_measurement_id = 'G-SSKBP7BDJW',
  ga4_enabled = true
where id = '91d30d5a-6ed3-4dc6-9c18-9c2cd88d0132'
   or name ilike 'Playworldhub';
