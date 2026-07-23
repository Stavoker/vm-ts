-- If schema.sql was already applied earlier, run this once.

create table if not exists public.telegram_chats (
  chat_id text primary key,
  username text,
  first_name text,
  activated_at timestamptz not null default now()
);

alter table public.telegram_chats enable row level security;

drop policy if exists "telegram_chats_all" on public.telegram_chats;
create policy "telegram_chats_all" on public.telegram_chats
  for all using (true) with check (true);
