create table if not exists public.daily_posts (
  id uuid primary key default gen_random_uuid(),
  posted_on date unique not null,
  tweet_id text,
  body text not null,
  new_claim_ids uuid[] not null default '{}',
  occupied_count integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.daily_posts enable row level security;
