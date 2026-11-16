-- Collecte d'intentions pour les précommandes. Aucun paiement ni commande n'est créé.

-- L'ancienne table est conservée, mais son ancien droit d'insertion publique est retiré.
revoke all on public.preorders from public, anon, authenticated;
revoke insert (creation_slug, first_name, last_name, email, product, size, quantity, delivery_info)
  on public.preorders from anon, authenticated;
drop policy if exists "preorders_insert_public" on public.preorders;
drop policy if exists "preorders_select_public" on public.preorders;
revoke all on function public.count_preorders() from public, anon, authenticated;

alter table public.drops
  add column if not exists price_min numeric(10, 2) not null default 25,
  add column if not exists price_max numeric(10, 2) not null default 35,
  add column if not exists final_price numeric(10, 2),
  add column if not exists preorders_closed_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'drops_final_price_in_range'
      and conrelid = 'public.drops'::regclass
  ) then
    alter table public.drops add constraint drops_final_price_in_range
      check (final_price is null or final_price between price_min and price_max);
  end if;
end $$;

create table if not exists public.preorder_registrations (
  id          uuid primary key default gen_random_uuid(),
  drop_id     uuid not null references public.drops (id) on delete restrict,
  first_name  text not null check (char_length(btrim(first_name)) between 1 and 60),
  email       text not null check (email = lower(email) and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  status      text not null default 'interested'
              check (status in ('interested', 'cancelled', 'converted')),
  consent_at  timestamptz not null,
  client_hash text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint preorder_registrations_drop_email_unique unique (drop_id, email)
);

create index if not exists preorder_registrations_client_created_idx
  on public.preorder_registrations (client_hash, created_at desc);
create index if not exists preorder_registrations_drop_status_idx
  on public.preorder_registrations (drop_id, status);

create table if not exists public.preorder_registration_items (
  id              uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.preorder_registrations (id) on delete cascade,
  size            text not null check (size in ('XS', 'S', 'M', 'L', 'XL', 'XXL')),
  quantity        integer not null check (quantity between 1 and 10),
  constraint preorder_registration_items_registration_size_unique unique (registration_id, size)
);

drop trigger if exists preorder_registrations_touch on public.preorder_registrations;
create trigger preorder_registrations_touch before update on public.preorder_registrations
  for each row execute function lf_private.touch_updated_at();

alter table public.preorder_registrations enable row level security;
alter table public.preorder_registration_items enable row level security;
revoke all on public.preorder_registrations, public.preorder_registration_items from public, anon, authenticated;

create or replace view public.preorder_stats_by_drop as
select
  d.id as drop_id,
  d.slug,
  count(distinct r.id)::bigint as people,
  coalesce(sum(i.quantity), 0)::bigint as shirts
from public.drops d
left join public.preorder_registrations r
  on r.drop_id = d.id and r.status = 'interested'
left join public.preorder_registration_items i on i.registration_id = r.id
group by d.id, d.slug;

create or replace view public.preorder_size_breakdown as
select
  d.id as drop_id,
  d.slug,
  i.size,
  count(distinct r.id)::bigint as people,
  sum(i.quantity)::bigint as shirts
from public.drops d
join public.preorder_registrations r
  on r.drop_id = d.id and r.status = 'interested'
join public.preorder_registration_items i on i.registration_id = r.id
group by d.id, d.slug, i.size;

create table if not exists lf_private.preorder_request_log (
  client_hash text not null,
  created_at  timestamptz not null default now()
);
create index if not exists preorder_request_log_client_created_idx
  on lf_private.preorder_request_log (client_hash, created_at desc);
revoke all on lf_private.preorder_request_log from public, anon, authenticated;

create or replace function public.register_preorder(
  p_drop_slug text,
  p_first_name text,
  p_email text,
  p_sizes jsonb,
  p_consent boolean,
  p_website text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_drop public.drops%rowtype;
  v_first text := btrim(coalesce(p_first_name, ''));
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_ip text := '';
  v_hash text;
  v_salt text;
  v_item jsonb;
  v_size text;
  v_quantity integer;
  v_registration_id uuid;
  v_people bigint;
  v_existing boolean;
begin
  if coalesce(btrim(p_website), '') <> '' then
    return jsonb_build_object('ok', false, 'code', 'robot_detected');
  end if;
  if p_consent is distinct from true then
    return jsonb_build_object('ok', false, 'code', 'consent_required');
  end if;
  if p_sizes is null or jsonb_typeof(p_sizes) is distinct from 'array' then
    return jsonb_build_object('ok', false, 'code', 'invalid_input');
  end if;
  if char_length(v_first) not between 1 and 60
     or v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
     or jsonb_array_length(p_sizes) not between 1 and 6 then
    return jsonb_build_object('ok', false, 'code', 'invalid_input');
  end if;

  if (select count(distinct item ->> 'size') from jsonb_array_elements(p_sizes) as x(item)) <> jsonb_array_length(p_sizes) then
    return jsonb_build_object('ok', false, 'code', 'invalid_input');
  end if;

  for v_item in select value from jsonb_array_elements(p_sizes)
  loop
    v_size := v_item ->> 'size';
    if v_size is null
       or v_size not in ('XS', 'S', 'M', 'L', 'XL', 'XXL')
       or coalesce(v_item ->> 'quantity', '') !~ '^[1-9][0-9]?$' then
      return jsonb_build_object('ok', false, 'code', 'invalid_input');
    end if;
    v_quantity := (v_item ->> 'quantity')::integer;
    if v_quantity not between 1 and 10 then
      return jsonb_build_object('ok', false, 'code', 'invalid_input');
    end if;
  end loop;

  select * into v_drop from public.drops where slug = p_drop_slug;
  if not found or not v_drop.preorder_open or v_drop.status = 'archived' then
    return jsonb_build_object('ok', false, 'code', 'closed');
  end if;

  begin
    v_ip := split_part(coalesce(
      current_setting('request.headers', true)::json ->> 'cf-connecting-ip',
      current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''), ',', 1);
  exception when others then
    v_ip := '';
  end;
  select salt into v_salt from lf_private.settings where id = 1;
  v_hash := encode(extensions.digest(
    case when btrim(v_ip) = '' then 'email:' || v_email else btrim(v_ip) end || v_salt,
    'sha256'
  ), 'hex');

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_hash, 0));
  delete from lf_private.preorder_request_log
  where created_at < now() - interval '10 minutes';
  if (select count(*) from lf_private.preorder_request_log
      where client_hash = v_hash and created_at > now() - interval '10 minutes') >= 5 then
    return jsonb_build_object('ok', false, 'code', 'rate_limited');
  end if;
  insert into lf_private.preorder_request_log (client_hash) values (v_hash);

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_drop.id::text || ':' || v_email, 0)
  );
  select exists (
    select 1 from public.preorder_registrations
    where drop_id = v_drop.id and email = v_email
  ) into v_existing;

  insert into public.preorder_registrations (drop_id, first_name, email, status, consent_at, client_hash)
  values (v_drop.id, v_first, v_email, 'interested', now(), v_hash)
  on conflict (drop_id, email) do update
  set first_name = excluded.first_name,
      status = case when public.preorder_registrations.status = 'converted'
                    then 'converted' else 'interested' end,
      consent_at = excluded.consent_at,
      client_hash = excluded.client_hash,
      updated_at = now()
  returning id into v_registration_id;

  delete from public.preorder_registration_items where registration_id = v_registration_id;
  insert into public.preorder_registration_items (registration_id, size, quantity)
  select v_registration_id, item ->> 'size', (item ->> 'quantity')::integer
  from jsonb_array_elements(p_sizes) as x(item);

  select count(*) into v_people
  from public.preorder_registrations
  where drop_id = v_drop.id and status = 'interested';
  return jsonb_build_object(
    'ok', true,
    'code', case when v_existing then 'updated' else 'registered' end,
    'people', v_people
  );
end
$$;

create or replace function public.count_preorder_registrations(p_drop_slug text)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::bigint
  from public.preorder_registrations r
  join public.drops d on d.id = r.drop_id
  where d.slug = p_drop_slug and r.status = 'interested';
$$;

revoke all on function public.register_preorder(text, text, text, jsonb, boolean, text) from public;
revoke all on function public.count_preorder_registrations(text) from public;
grant execute on function public.register_preorder(text, text, text, jsonb, boolean, text) to anon, authenticated;
grant execute on function public.count_preorder_registrations(text) to anon, authenticated;

create or replace function lf_admin.close_preorders(p_slug text)
returns text language plpgsql security definer set search_path = '' as $$
begin
  update public.drops set preorder_open = false, preorders_closed_at = now()
  where slug = p_slug;
  if not found then raise exception 'Drop inconnu : %', p_slug; end if;
  return format('Précommandes fermées pour %s.', p_slug);
end $$;

create or replace function lf_admin.open_preorders(p_slug text)
returns text language plpgsql security definer set search_path = '' as $$
begin
  update public.drops
  set preorder_open = true, preorders_closed_at = null
  where slug = p_slug and status <> 'archived';
  if not found then raise exception 'Drop inconnu ou archivé : %', p_slug; end if;
  return format('Précommandes ouvertes pour %s.', p_slug);
end $$;

create or replace function lf_admin.set_drop_status(p_slug text, p_status text)
returns text language plpgsql security definer set search_path = '' as $$
begin
  if p_status is null or p_status not in ('upcoming', 'current', 'archived') then
    raise exception 'Statut de drop invalide : %', p_status;
  end if;
  update public.drops
  set status = p_status,
      preorder_open = case when p_status = 'archived' then false else preorder_open end,
      preorders_closed_at = case when p_status = 'archived' then coalesce(preorders_closed_at, now()) else preorders_closed_at end
  where slug = p_slug;
  if not found then raise exception 'Drop inconnu : %', p_slug; end if;
  return format('%s : statut = %s.', p_slug, p_status);
end $$;

create or replace function lf_admin.set_final_price(p_slug text, p_price numeric)
returns text language plpgsql security definer set search_path = '' as $$
declare
begin
  if not exists (select 1 from public.drops where slug = p_slug) then
    raise exception 'Drop inconnu : %', p_slug;
  end if;
  if p_price is null or p_price < 25 or p_price > 35 then
    raise exception 'Le prix final doit être compris entre 25 et 35 €.';
  end if;
  update public.drops set final_price = p_price, price = p_price where slug = p_slug;
  return format('%s : prix final fixé à %s €.', p_slug, p_price);
end $$;

revoke all on all functions in schema lf_admin from public, anon, authenticated;
