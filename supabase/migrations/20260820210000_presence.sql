create table if not exists public.presence (
  visitor_id text primary key,
  last_seen timestamptz not null default now(),
  seen_on date not null
);

create index if not exists presence_last_seen_idx on public.presence (last_seen);
create index if not exists presence_seen_on_idx on public.presence (seen_on);

alter table public.presence enable row level security;
