alter table public.x_auth
  add column if not exists refresh_token text;
