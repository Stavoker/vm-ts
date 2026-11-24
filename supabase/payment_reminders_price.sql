-- Run once in Supabase SQL Editor (safe to re-run).
alter table public.payment_reminders
  add column if not exists price numeric;
