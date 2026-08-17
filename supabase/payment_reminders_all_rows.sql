-- Allow rows without Істекає and keep one record per Notion page.

alter table public.payment_reminders
  alter column due_date drop not null;

do $$
declare
  rec record;
begin
  for rec in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.payment_reminders'::regclass
      and c.contype = 'u'
      and pg_get_constraintdef(c.oid) ilike '%notion_page_id%'
  loop
    execute format(
      'alter table public.payment_reminders drop constraint if exists %I',
      rec.conname
    );
  end loop;
end $$;

create unique index if not exists payment_reminders_notion_page_id_uidx
  on public.payment_reminders (notion_page_id);
