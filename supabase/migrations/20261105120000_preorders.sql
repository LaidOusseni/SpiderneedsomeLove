-- ═══════════════════════════════════════════════════════════════════════════
-- Love&Faith — Précommandes du drop Batman
-- Idempotent : les objets existants ne sont pas recréés.
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.preorders (
  id            uuid primary key default gen_random_uuid(),
  creation_slug text not null default 'batman-drop-01',
  first_name    text not null check (char_length(first_name) between 1 and 60),
  last_name     text not null check (char_length(last_name) between 1 and 60),
  email         text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  product       text not null default 'long' check (product in ('short', 'long')),
  size          text not null check (size in ('XS', 'S', 'M', 'L', 'XL', 'XXL')),
  quantity      integer not null default 1 check (quantity between 1 and 10),
  delivery_info text,
  paid          boolean not null default false,
  status        text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.preorders add column if not exists creation_slug text;
alter table public.preorders add column if not exists delivery_info text;
alter table public.preorders add column if not exists paid boolean not null default false;
alter table public.preorders add column if not exists updated_at timestamptz not null default now();
alter table public.preorders add column if not exists product text not null default 'long';

create or replace function public.count_preorders()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select count(*) from public.preorders;
$$;

alter table public.preorders enable row level security;
revoke all on public.preorders from anon, authenticated;

drop policy if exists "preorders_insert_public" on public.preorders;
create policy "preorders_insert_public"
on public.preorders
for insert
with check (
  creation_slug = 'batman-drop-01'
  and char_length(first_name) between 1 and 60
  and char_length(last_name) between 1 and 60
  and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  and product in ('short', 'long')
  and size in ('XS', 'S', 'M', 'L', 'XL', 'XXL')
  and quantity between 1 and 10
);
grant insert (creation_slug, first_name, last_name, email, product, size, quantity, delivery_info)
  on public.preorders to anon, authenticated;

revoke all on function public.count_preorders() from public;
grant execute on function public.count_preorders() to anon, authenticated;

drop trigger if exists preorder_touch on public.preorders;
create trigger preorder_touch
before update on public.preorders
for each row execute function lf_private.touch_updated_at();
