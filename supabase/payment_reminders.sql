-- Run this in Supabase SQL Editor once (safe to re-run).

do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'reminder_kind' and n.nspname = 'public'
  ) then
    create type public.reminder_kind as enum ('phone', 'domain');
  end if;

  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'reminder_status' and n.nspname = 'public'
  ) then
    create type public.reminder_status as enum ('pending', 'later', 'payed');
  end if;
end $$;

create table if not exists public.payment_reminders (
  id uuid primary key default gen_random_uuid(),
  notion_page_id text not null,
  kind public.reminder_kind not null,
  company text not null,
  target text,
  pay_for text,
  due_date date,
  status public.reminder_status not null default 'pending',
  last_notified_at timestamptz,
  payed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (notion_page_id)
);

create index if not exists payment_reminders_status_due_idx
  on public.payment_reminders (status, due_date);

drop trigger if exists payment_reminders_set_updated_at on public.payment_reminders;
create trigger payment_reminders_set_updated_at
before update on public.payment_reminders
for each row execute function public.set_updated_at();

alter table public.payment_reminders enable row level security;

drop policy if exists "payment_reminders_all" on public.payment_reminders;
create policy "payment_reminders_all" on public.payment_reminders
  for all using (true) with check (true);
