create table if not exists public.x_oauth_pending (
  oauth_token text primary key,
  oauth_token_secret text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.x_auth (
  id integer primary key default 1,
  access_token text not null,
  access_secret text not null,
  user_id text,
  screen_name text,
  updated_at timestamptz not null default now(),
  check (id = 1)
);

alter table public.x_oauth_pending enable row level security;
alter table public.x_auth enable row level security;
