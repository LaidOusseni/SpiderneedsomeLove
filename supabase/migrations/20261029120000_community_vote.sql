-- ═══════════════════════════════════════════════════════════════════════════
-- Love&Faith — Vote communautaire (créations, votes, drop) + correctif sécurité
-- À exécuter UNE FOIS dans Supabase → SQL Editor (voir docs/SUPABASE.md).
-- Idempotent : peut être relancé sans dupliquer les objets ni toucher aux données.
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto with schema extensions;

-- ─────────────────────────────────────────────────────────────────────────
-- 0. CORRECTIF : la politique « preorders_select_public » (USING true) permettait
--    à n'importe qui, avec la clé publique, de lire noms, Instagram et emails
--    des précommandes. Le site n'utilise plus cette lecture. Les données sont conservées.
-- ─────────────────────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.preorders') is not null then
    drop policy if exists "preorders_select_public" on public.preorders;
    -- Les précommandes sont fermées et le formulaire a été retiré du site.
    -- Pour bloquer aussi les insertions anonymes, décommenter la ligne suivante :
    -- drop policy if exists "preorders_insert_public" on public.preorders;
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. CRÉATIONS
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.creations (
  id                 uuid primary key default gen_random_uuid(),
  slug               text not null unique check (slug ~ '^[a-z0-9-]{2,60}$'),
  name               text not null,
  description        text,
  history            text,
  icon_path          text,
  front_mockup_path  text,
  back_mockup_path   text,
  model_path         text,
  garment_type       text not null default 'longsleeve' check (garment_type in ('longsleeve', 'tee')),
  garment_color      text,
  is_active          boolean not null default true,   -- visible sur le site
  is_candidate       boolean not null default false,  -- en compétition pour le drop en cours
  status             text not null default 'preparing'
                     check (status in ('preparing', 'candidate', 'closed', 'winner', 'historic')),
  sort_order         integer not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────
-- 2. PARAMÈTRES DU DROP (une seule ligne, id = 1)
--    vote_status : 'preparing' | 'open' | 'closed' | 'announced'
--    Le gagnant officiel est une donnée explicite (winner_creation_id),
--    jamais déduit du classement.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.drop_settings (
  id                    smallint primary key default 1 check (id = 1),
  drop_name             text not null default 'Prochain drop',
  vote_status           text not null default 'preparing'
                        check (vote_status in ('preparing', 'open', 'closed', 'announced')),
  opens_at              timestamptz,     -- informatif / optionnel
  closes_at             timestamptz,     -- optionnel : si renseigné, le vote est refusé après cette date
  winner_creation_id    uuid references public.creations (id) on delete set null,
  winner_announced_at   timestamptz,
  notes                 text,
  updated_at            timestamptz not null default now(),
  constraint winner_requires_announce check (winner_creation_id is null or vote_status = 'announced')
);

-- ─────────────────────────────────────────────────────────────────────────
-- 3. VOTES (données personnelles : aucune lecture publique)
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.votes (
  id                    uuid primary key default gen_random_uuid(),
  creation_id           uuid not null references public.creations (id) on delete restrict,
  first_name            text not null check (char_length(first_name) between 1 and 60),
  last_name             text not null check (char_length(last_name) between 1 and 60),
  instagram_handle      text not null,                       -- tel que saisi (nettoyé)
  instagram_normalized  text not null check (instagram_normalized ~ '^[a-z0-9._]{1,30}$'),
  client_hash           text,                                -- empreinte salée de l'IP (limitation de fréquence)
  created_at            timestamptz not null default now(),
  constraint votes_one_per_creation unique (creation_id, instagram_normalized)
);
create index if not exists votes_client_hash_created_idx on public.votes (client_hash, created_at desc);
create index if not exists votes_creation_idx on public.votes (creation_id);

-- Sel privé pour l'empreinte IP (schéma non exposé par l'API)
create schema if not exists lf_private;
revoke all on schema lf_private from public;
create table if not exists lf_private.settings (
  id    smallint primary key default 1 check (id = 1),
  salt  text not null default encode(extensions.gen_random_bytes(24), 'hex')
);
insert into lf_private.settings (id) values (1) on conflict (id) do nothing;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. updated_at automatique
-- ─────────────────────────────────────────────────────────────────────────
create or replace function lf_private.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists creations_touch on public.creations;
create trigger creations_touch before update on public.creations
  for each row execute function lf_private.touch_updated_at();
drop trigger if exists drop_settings_touch on public.drop_settings;
create trigger drop_settings_touch before update on public.drop_settings
  for each row execute function lf_private.touch_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- 5. RLS + privilèges (moindre privilège)
-- ─────────────────────────────────────────────────────────────────────────
alter table public.creations     enable row level security;
alter table public.drop_settings enable row level security;
alter table public.votes         enable row level security;
-- (pas de FORCE : le propriétaire — utilisé par cast_vote en SECURITY DEFINER — doit pouvoir écrire)

revoke all on public.creations, public.drop_settings, public.votes from anon, authenticated;

-- Créations et paramètres du drop : lecture publique (aucune donnée personnelle)
grant select on public.creations, public.drop_settings to anon, authenticated;
drop policy if exists "creations_read_active" on public.creations;
create policy "creations_read_active" on public.creations for select using (is_active);
drop policy if exists "drop_settings_read" on public.drop_settings;
create policy "drop_settings_read" on public.drop_settings for select using (true);
-- votes : AUCUNE politique, AUCUN privilège → ni lecture, ni écriture directe.
-- L'écriture passe exclusivement par public.cast_vote (SECURITY DEFINER).

-- ─────────────────────────────────────────────────────────────────────────
-- 6. Normalisation Instagram (identique à src/utils/instagram.js)
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.lf_normalize_instagram(p_value text)
returns text language sql immutable set search_path = '' as $$
  select regexp_replace(
           regexp_replace(
             split_part(split_part(split_part(
               regexp_replace(lower(btrim(coalesce(p_value, ''))),
                 '^(https?://)?(www\.)?(instagram\.com|instagr\.am)/', ''),
               '/', 1), '?', 1), '#', 1),
             '^@+', ''),
           '\s+', '', 'g')
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 7. Vue d'ensemble publique : statut du drop + compteurs (aucune donnée personnelle)
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.get_drop_overview()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'drop', (
      select jsonb_build_object(
        'name', d.drop_name,
        'vote_status', case
          when d.vote_status = 'open' and d.closes_at is not null and now() >= d.closes_at then 'closed'
          else d.vote_status end,
        'opens_at', d.opens_at,
        'closes_at', d.closes_at,
        'winner_slug', w.slug,
        'winner_announced_at', d.winner_announced_at
      )
      from public.drop_settings d
      left join public.creations w on w.id = d.winner_creation_id
      where d.id = 1
    ),
    'creations', coalesce((
      select jsonb_agg(jsonb_build_object(
               'slug', c.slug,
               'status', c.status,
               'is_candidate', c.is_candidate,
               'votes', (select count(*) from public.votes v where v.creation_id = c.id)
             ) order by c.sort_order, c.slug)
      from public.creations c
      where c.is_active
    ), '[]'::jsonb)
  );
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 8. Enregistrement sécurisé d'un vote
--    Codes renvoyés : ok | already_voted | invalid_input | invalid_instagram |
--                     not_eligible | voting_closed | rate_limited
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.cast_vote(
  p_creation_slug text,
  p_first_name    text,
  p_last_name     text,
  p_instagram     text,
  p_website       text default null   -- champ piège anti-robot (doit rester vide)
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_first    text := left(regexp_replace(btrim(coalesce(p_first_name, '')), '\s+', ' ', 'g'), 60);
  v_last     text := left(regexp_replace(btrim(coalesce(p_last_name, '')), '\s+', ' ', 'g'), 60);
  v_handle   text := left(btrim(coalesce(p_instagram, '')), 120);
  v_norm     text := public.lf_normalize_instagram(p_instagram);
  v_creation public.creations%rowtype;
  v_drop     public.drop_settings%rowtype;
  v_ip       text;
  v_hash     text;
  v_recent   integer;
  v_votes    bigint;
begin
  -- Champ piège rempli = robot : refus sans détail, rien n'est enregistré
  if coalesce(btrim(p_website), '') <> '' then
    return jsonb_build_object('ok', false, 'code', 'invalid_input');
  end if;

  if char_length(v_first) = 0 or char_length(v_last) = 0 then
    return jsonb_build_object('ok', false, 'code', 'invalid_input');
  end if;
  if v_norm !~ '^[a-z0-9._]{1,30}$' or v_norm like '.%' or v_norm like '%.' or v_norm like '%..%' then
    return jsonb_build_object('ok', false, 'code', 'invalid_instagram');
  end if;

  select * into v_drop from public.drop_settings where id = 1;
  if not found or v_drop.vote_status <> 'open'
     or (v_drop.closes_at is not null and now() >= v_drop.closes_at)
     or (v_drop.opens_at is not null and now() < v_drop.opens_at) then
    return jsonb_build_object('ok', false, 'code', 'voting_closed');
  end if;

  select * into v_creation from public.creations where slug = p_creation_slug;
  if not found or not v_creation.is_active or not v_creation.is_candidate or v_creation.status <> 'candidate' then
    return jsonb_build_object('ok', false, 'code', 'not_eligible');
  end if;

  -- Limitation de fréquence par client (empreinte salée de l'IP transmise par l'API Supabase)
  begin
    v_ip := split_part(coalesce(
      current_setting('request.headers', true)::json ->> 'cf-connecting-ip',
      current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''), ',', 1);
  exception when others then
    v_ip := '';
  end;
  if btrim(v_ip) <> '' then
    select encode(extensions.digest(btrim(v_ip) || s.salt, 'sha256'), 'hex') into v_hash
    from lf_private.settings s where s.id = 1;
    select count(*) into v_recent from public.votes
    where client_hash = v_hash and created_at > now() - interval '10 minutes';
    if v_recent >= 15 then
      return jsonb_build_object('ok', false, 'code', 'rate_limited');
    end if;
  end if;

  begin
    insert into public.votes (creation_id, first_name, last_name, instagram_handle, instagram_normalized, client_hash)
    values (v_creation.id, v_first, v_last, v_handle, v_norm, v_hash);
  exception when unique_violation then
    -- Doublon (y compris deux requêtes simultanées) : la contrainte UNIQUE fait foi
    select count(*) into v_votes from public.votes where creation_id = v_creation.id;
    return jsonb_build_object('ok', false, 'code', 'already_voted', 'votes', v_votes);
  end;

  select count(*) into v_votes from public.votes where creation_id = v_creation.id;
  return jsonb_build_object('ok', true, 'code', 'ok', 'votes', v_votes);
end $$;

-- Exécution : publique uniquement pour les deux fonctions d'API
revoke all on function public.cast_vote(text, text, text, text, text) from public;
revoke all on function public.get_drop_overview() from public;
grant execute on function public.cast_vote(text, text, text, text, text) to anon, authenticated;
grant execute on function public.get_drop_overview() to anon, authenticated;
revoke all on function lf_private.touch_updated_at() from public;
