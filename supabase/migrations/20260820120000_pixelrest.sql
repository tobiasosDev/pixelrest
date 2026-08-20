create extension if not exists "pgcrypto";

create table if not exists public.claims (
  id uuid primary key default gen_random_uuid(),
  x integer not null,
  y integer not null,
  width integer not null,
  height integer not null,
  url text not null,
  description text not null,
  logo_url text,
  owner_email text,
  stripe_session_id text unique,
  created_at timestamptz not null default now(),
  check (width >= 1 and height >= 1)
);

create table if not exists public.occupancy (
  x integer not null,
  y integer not null,
  claim_id uuid not null references public.claims (id) on delete cascade,
  primary key (x, y)
);

create index if not exists occupancy_claim_id_idx on public.occupancy (claim_id);

create table if not exists public.pending_checkouts (
  stripe_session_id text primary key,
  x integer not null,
  y integer not null,
  width integer not null,
  height integer not null,
  url text not null,
  description text not null,
  square_count integer not null,
  amount_cents integer not null,
  created_at timestamptz not null default now()
);

alter table public.claims enable row level security;
alter table public.occupancy enable row level security;
alter table public.pending_checkouts enable row level security;

create policy "claims are publicly readable"
  on public.claims for select
  using (true);

create policy "occupancy is publicly readable"
  on public.occupancy for select
  using (true);

-- writes go through the service role (bypasses RLS)
