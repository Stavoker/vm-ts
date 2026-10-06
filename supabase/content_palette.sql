-- Per-project content-factory palettes. Safe to re-run.

alter table public.sites
  add column if not exists content_palette jsonb;
