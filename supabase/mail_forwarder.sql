-- Zoho → legal mailboxes. Safe to re-run: creates only what is missing.
-- RLS stays on so anon/authenticated cannot read tokens. Use the service role.

create table if not exists public.mailboxes (
  email text primary key,
  company text not null,
  responsible text not null,
  enabled integer not null default 0,
  refresh_token_env text,
  refresh_token text,
  account_id text,
  created_at text not null,
  updated_at text not null,
  zoho_accounts_base_url text,
  zoho_mail_base_url text,
  zoho_client_id text,
  zoho_client_secret text
);

create table if not exists public.processed_messages (
  mailbox_email text not null,
  zoho_message_id text not null,
  original_message_id text,
  subject text,
  provider_message_id text,
  forwarded_at text not null,
  primary key (mailbox_email, zoho_message_id)
);

create table if not exists public.forward_attempts (
  mailbox_email text not null,
  zoho_message_id text not null,
  folder_id text not null,
  subject text,
  from_address text,
  to_address text,
  received_time_ms bigint,
  has_attachment integer not null default 0,
  has_inline integer not null default 0,
  attempts integer not null default 0,
  last_error text,
  last_attempt_at text not null,
  primary key (mailbox_email, zoho_message_id)
);

create table if not exists public.mailbox_sync (
  mailbox_email text primary key,
  initial_import_done integer not null default 0,
  updated_at text not null
);

alter table public.mailboxes enable row level security;
alter table public.processed_messages enable row level security;
alter table public.forward_attempts enable row level security;
alter table public.mailbox_sync enable row level security;

grant all on table public.mailboxes to anon, authenticated, service_role;
grant all on table public.processed_messages to anon, authenticated, service_role;
grant all on table public.forward_attempts to anon, authenticated, service_role;
grant all on table public.mailbox_sync to anon, authenticated, service_role;

drop policy if exists "mailboxes_all" on public.mailboxes;
create policy "mailboxes_all" on public.mailboxes
  for all using (true) with check (true);

drop policy if exists "processed_messages_all" on public.processed_messages;
create policy "processed_messages_all" on public.processed_messages
  for all using (true) with check (true);

drop policy if exists "forward_attempts_all" on public.forward_attempts;
create policy "forward_attempts_all" on public.forward_attempts
  for all using (true) with check (true);

drop policy if exists "mailbox_sync_all" on public.mailbox_sync;
create policy "mailbox_sync_all" on public.mailbox_sync
  for all using (true) with check (true);
