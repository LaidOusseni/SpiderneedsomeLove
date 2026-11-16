-- ═══════════════════════════════════════════════════════════════════════════
-- Love&Faith — Organisation des données : drops, votes, classement, newsletter
-- À exécuter APRÈS les migrations précédentes (voir docs/SUPABASE.md, ordre complet).
--
-- Idempotent et NON DESTRUCTIF :
--   • aucune ligne n'est supprimée ;
--   • la table `votes` est RENOMMÉE en `drop_votes` (mêmes lignes, même contrainte anti-doublon) ;
--   • les adresses de l'ancienne table `newsletter` sont COPIÉES dans `newsletter_subscribers`
--     (l'ancienne table est conservée telle quelle, en lecture seule pour l'administration).
--
-- Contenu :
--   1. drops                     — drops commerciaux (Batman = current, Masks & Hearts = archived)
--   2. drop_votes                — un vote individuel par ligne (ex-table `votes`)
--   3. creations.vote_status     — statut de candidature : candidate | voting_open | voting_closed | selected
--   4. synchronisation           — fermer/ouvrir le vote dans drop_settings met à jour les candidates
--   5. drop_vote_totals          — vue du classement calculée depuis les votes réels
--   6. cast_vote / get_drop_overview — réécrites sur drop_votes (mêmes règles, mêmes codes)
--   7. newsletter_subscribers    — inscriptions, consentement, désinscription
--   8. lf_admin                  — fonctions d'administration (SQL Editor uniquement)
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto with schema extensions;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. DROPS — statut COMMERCIAL d'un drop (distinct de la candidature au vote)
--    status : upcoming | current | archived
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.drops (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique check (slug ~ '^[a-z0-9-]{2,60}$'),
  name              text not null,
  description       text,
  status            text not null default 'upcoming' check (status in ('upcoming', 'current', 'archived')),
  front_image       text,
  back_image        text,
  banner_image      text,
  price             numeric(10, 2) check (price is null or price >= 0),   -- en euros ; à renseigner
  is_featured       boolean not null default false,
  preorder_open     boolean not null default false,
  is_vote_candidate boolean not null default false check (not is_vote_candidate or status = 'upcoming'),
  creation_id       uuid references public.creations (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.drops is
  'Drops commerciaux Love&Faith. status = current : en vente / précommande ; archived : déjà sorti. '
  'Ne participe jamais au vote (la candidature est portée par creations.vote_status).';

-- Un seul drop « current » à la fois
create unique index if not exists drops_single_current on public.drops ((true)) where status = 'current';

drop trigger if exists drops_touch on public.drops;
create trigger drops_touch before update on public.drops
  for each row execute function lf_private.touch_updated_at();

alter table public.drops enable row level security;
revoke all on public.drops from anon, authenticated;
grant select on public.drops to anon, authenticated;
drop policy if exists "drops_read_public" on public.drops;
create policy "drops_read_public" on public.drops for select using (true);

insert into public.drops
  (slug, name, description, status, front_image, back_image, banner_image, is_featured, preorder_open, is_vote_candidate, creation_id)
values
  ('batman-drop-01', 'Batman', 'Drop #01 — le premier chapitre Love&Faith.', 'current',
   '/creations/love-in-darkness/front.webp', '/creations/love-in-darkness/back.webp', null,
   true, true, false, (select id from public.creations where slug = 'batman-drop-01')),
  ('masks-and-hearts', 'Masks & Hearts', 'Tome I — déjà sorti.', 'archived',
   '/creations/masks-and-hearts/front.webp', '/creations/masks-and-hearts/back.webp', null,
   false, false, false, (select id from public.creations where slug = 'masks-and-hearts'))
on conflict (slug) do nothing;   -- les valeurs modifiées depuis le dashboard ne sont jamais écrasées

-- ─────────────────────────────────────────────────────────────────────────
-- 2. DROP_VOTES — la table `votes` est renommée (aucune copie, aucune perte)
--    candidate_id         : création candidate (ex-creation_id)
--    instagram_normalized : identifiant du votant (système déjà en place)
--    Contrainte anti-doublon conservée : UNIQUE (candidate_id, instagram_normalized)
-- ─────────────────────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.votes') is not null and to_regclass('public.drop_votes') is null then
    alter table public.votes rename to drop_votes;
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'drop_votes' and column_name = 'creation_id') then
    alter table public.drop_votes rename column creation_id to candidate_id;
  end if;
end $$;

-- Projet où la table n'aurait jamais existé
create table if not exists public.drop_votes (
  id                    uuid primary key default gen_random_uuid(),
  candidate_id          uuid not null references public.creations (id) on delete restrict,
  first_name            text not null check (char_length(first_name) between 1 and 60),
  last_name             text not null check (char_length(last_name) between 1 and 60),
  instagram_handle      text not null,
  instagram_normalized  text not null check (instagram_normalized ~ '^[a-z0-9._]{1,30}$'),
  client_hash           text,
  created_at            timestamptz not null default now(),
  constraint votes_one_per_creation unique (candidate_id, instagram_normalized)
);
create index if not exists votes_client_hash_created_idx on public.drop_votes (client_hash, created_at desc);
create index if not exists votes_creation_idx on public.drop_votes (candidate_id);

comment on table public.drop_votes is
  'Un vote individuel par ligne. Aucune lecture ni écriture publique : écriture via public.cast_vote uniquement. '
  'instagram_normalized = identifiant du votant ; UNIQUE (candidate_id, instagram_normalized).';

alter table public.drop_votes enable row level security;
revoke all on public.drop_votes from anon, authenticated;   -- ni lecture, ni écriture directe

-- ─────────────────────────────────────────────────────────────────────────
-- 3. STATUT DE CANDIDATURE (par création)
--    candidate     : en lice, vote pas encore ouvert
--    voting_open   : vote ouvert pour cette création
--    voting_closed : vote clos (classement et scores restent visibles)
--    selected      : création retenue pour devenir un drop
--    NULL          : pas candidate (drop actuel, ancien drop…)
-- ─────────────────────────────────────────────────────────────────────────
alter table public.creations add column if not exists vote_status text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'creations_vote_status_check'
                 and conrelid = 'public.creations'::regclass) then
    alter table public.creations add constraint creations_vote_status_check
      check (vote_status is null or vote_status in ('candidate', 'voting_open', 'voting_closed', 'selected'));
  end if;
end $$;

-- Initialisation à partir de l'état actuel (seules les lignes encore sans statut sont touchées)
update public.creations c
set vote_status = case
    when not c.is_candidate or c.status = 'historic' then null
    when (select vote_status from public.drop_settings where id = 1) = 'open' then 'voting_open'
    when (select vote_status from public.drop_settings where id = 1) in ('closed', 'announced') then 'voting_closed'
    else 'candidate' end
where c.vote_status is null;

-- Batman (drop actuel) et Masks & Hearts (ancien drop) ne sont jamais candidats
update public.creations set is_candidate = false, vote_status = null
where slug in ('batman-drop-01', 'masks-and-hearts') and (is_candidate or vote_status is not null);

-- ─────────────────────────────────────────────────────────────────────────
-- 4. SYNCHRONISATION — ouvrir / fermer dans drop_settings (Table Editor ou SQL)
--    met à jour les candidates. Aucune fermeture automatique : uniquement sur action manuelle.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function lf_private.sync_candidate_vote_status()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.vote_status is distinct from old.vote_status then
    if new.vote_status = 'open' then
      update public.creations set vote_status = 'voting_open'
      where is_candidate and vote_status in ('candidate', 'voting_closed');
    elsif new.vote_status in ('closed', 'announced') then
      update public.creations set vote_status = 'voting_closed'
      where is_candidate and vote_status in ('candidate', 'voting_open');
    end if;
  end if;
  if new.winner_creation_id is not null and new.winner_creation_id is distinct from old.winner_creation_id then
    update public.creations set vote_status = 'selected' where id = new.winner_creation_id and is_candidate;
  end if;
  return new;
end $$;
revoke all on function lf_private.sync_candidate_vote_status() from public;

drop trigger if exists drop_settings_sync_candidates on public.drop_settings;
create trigger drop_settings_sync_candidates after update on public.drop_settings
  for each row execute function lf_private.sync_candidate_vote_status();

-- ─────────────────────────────────────────────────────────────────────────
-- 5. CLASSEMENT — vue calculée depuis les votes individuels (pas de compteur séparé)
--    Exclut le drop actuel, les anciens drops et toute création non candidate.
--    Égalité : même rang ; ordre d'affichage stable (sort_order puis slug).
--    La vue s'exécute avec les droits de son propriétaire pour compter des lignes que le public ne peut pas lire :
--    elle n'expose AUCUNE donnée personnelle (identifiant, nom, image, total, rang).
-- ─────────────────────────────────────────────────────────────────────────
create or replace view public.drop_vote_totals as
with totals as (
  select c.id, c.slug, c.name, c.icon_path, c.front_mockup_path, c.vote_status, c.sort_order,
         (select count(*) from public.drop_votes v where v.candidate_id = c.id) as votes
  from public.creations c
  where c.is_active
    and c.is_candidate
    and c.vote_status is not null
    and c.status <> 'historic'
    and not exists (select 1 from public.drops d where d.slug = c.slug and d.status in ('current', 'archived'))
)
select t.id                as candidate_id,
       t.slug,
       t.name,
       t.icon_path         as image,
       t.front_mockup_path,
       t.vote_status,
       t.votes::integer    as votes,
       (rank() over (order by t.votes desc))::integer                               as rank,
       (row_number() over (order by t.votes desc, t.sort_order, t.slug))::integer   as position
from totals t
order by position;

comment on view public.drop_vote_totals is
  'Classement public des créations candidates : nombre de votes calculé par count(*) sur drop_votes.';

revoke all on public.drop_vote_totals from anon, authenticated;
grant select on public.drop_vote_totals to anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 6. FONCTIONS PUBLIQUES DU VOTE — mêmes signatures et mêmes codes qu'avant
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
        'vote_status', d.vote_status,
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
               'vote_status', c.vote_status,
               'votes', (select count(*) from public.drop_votes v where v.candidate_id = c.id)
             ) order by c.sort_order, c.slug)
      from public.creations c
      where c.is_active
    ), '[]'::jsonb)
  );
$$;

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
  if coalesce(btrim(p_website), '') <> '' then
    return jsonb_build_object('ok', false, 'code', 'invalid_input');
  end if;
  if char_length(v_first) = 0 or char_length(v_last) = 0 then
    return jsonb_build_object('ok', false, 'code', 'invalid_input');
  end if;
  if v_norm !~ '^[a-z0-9._]{1,30}$' or v_norm like '.%' or v_norm like '%.' or v_norm like '%..%' then
    return jsonb_build_object('ok', false, 'code', 'invalid_instagram');
  end if;

  -- Interrupteur général (fermeture manuelle uniquement)
  select * into v_drop from public.drop_settings where id = 1;
  if not found or v_drop.vote_status <> 'open' then
    return jsonb_build_object('ok', false, 'code', 'voting_closed');
  end if;

  select * into v_creation from public.creations where slug = p_creation_slug;
  if not found or not v_creation.is_active or not v_creation.is_candidate or v_creation.status <> 'candidate'
     or exists (select 1 from public.drops d where d.slug = v_creation.slug and d.status in ('current', 'archived')) then
    return jsonb_build_object('ok', false, 'code', 'not_eligible');
  end if;
  -- Statut propre à la création : seules les candidates « voting_open » reçoivent des votes
  if v_creation.vote_status is distinct from 'voting_open' then
    return jsonb_build_object('ok', false, 'code',
      case when v_creation.vote_status in ('voting_closed', 'selected') then 'voting_closed' else 'not_eligible' end);
  end if;

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
    select count(*) into v_recent from public.drop_votes
    where client_hash = v_hash and created_at > now() - interval '10 minutes';
    if v_recent >= 15 then
      return jsonb_build_object('ok', false, 'code', 'rate_limited');
    end if;
  end if;

  begin
    insert into public.drop_votes (candidate_id, first_name, last_name, instagram_handle, instagram_normalized, client_hash)
    values (v_creation.id, v_first, v_last, v_handle, v_norm, v_hash);
  exception when unique_violation then
    select count(*) into v_votes from public.drop_votes where candidate_id = v_creation.id;
    return jsonb_build_object('ok', false, 'code', 'already_voted', 'votes', v_votes);
  end;

  select count(*) into v_votes from public.drop_votes where candidate_id = v_creation.id;
  return jsonb_build_object('ok', true, 'code', 'ok', 'votes', v_votes);
end $$;

revoke all on function public.cast_vote(text, text, text, text, text) from public;
revoke all on function public.get_drop_overview() from public;
grant execute on function public.cast_vote(text, text, text, text, text) to anon, authenticated;
grant execute on function public.get_drop_overview() to anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 7. NEWSLETTER — newsletter_subscribers
--    status : subscribed | unsubscribed ; consent_at obligatoire ; jeton de désinscription par adresse.
--    Le site n'a AUCUN accès direct à la table : uniquement les deux fonctions ci-dessous.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.newsletter_subscribers (
  id                uuid primary key default gen_random_uuid(),
  email             text not null unique
                    check (char_length(email) between 3 and 254
                           and email = lower(btrim(email))
                           and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  status            text not null default 'subscribed' check (status in ('subscribed', 'unsubscribed')),
  consent_at        timestamptz not null,
  source            text not null default 'site',
  unsubscribe_token uuid not null unique default gen_random_uuid(),
  unsubscribed_at   timestamptz,
  client_hash       text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists newsletter_subscribers_status_idx on public.newsletter_subscribers (status, created_at desc);
create index if not exists newsletter_subscribers_client_idx on public.newsletter_subscribers (client_hash, created_at desc);

comment on table public.newsletter_subscribers is
  'Inscrits à la newsletter Love&Faith. Envoyer uniquement aux lignes status = subscribed. '
  'Lien de désinscription : https://<site>/newsletter/desinscription?jeton=<unsubscribe_token>';

drop trigger if exists newsletter_subscribers_touch on public.newsletter_subscribers;
create trigger newsletter_subscribers_touch before update on public.newsletter_subscribers
  for each row execute function lf_private.touch_updated_at();

alter table public.newsletter_subscribers enable row level security;
revoke all on public.newsletter_subscribers from anon, authenticated;

-- Reprise des adresses de l'ancienne table (inscription « application », V1) — copie, rien n'est supprimé
do $$
begin
  if to_regclass('public.newsletter') is not null then
    insert into public.newsletter_subscribers (email, status, consent_at, source, created_at)
    select lower(btrim(n.email)), 'subscribed', coalesce(n.created_at, now()), 'legacy_newsletter', coalesce(n.created_at, now())
    from public.newsletter n
    where n.email is not null
      and lower(btrim(n.email)) ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
      and char_length(btrim(n.email)) between 3 and 254
    on conflict (email) do nothing;
    -- Une seule porte d'entrée désormais : l'ancienne table ne reçoit plus d'inscriptions publiques
    revoke insert on public.newsletter from anon, authenticated;
  end if;
end $$;

create or replace function public.newsletter_subscribe(
  p_email   text,
  p_consent boolean,
  p_website text default null   -- champ piège anti-robot
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_email  text := lower(btrim(coalesce(p_email, '')));
  v_row    public.newsletter_subscribers%rowtype;
  v_ip     text;
  v_hash   text;
  v_recent integer;
begin
  if coalesce(btrim(p_website), '') <> '' then
    return jsonb_build_object('ok', false, 'code', 'invalid_email');
  end if;
  if char_length(v_email) not between 3 and 254
     or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return jsonb_build_object('ok', false, 'code', 'invalid_email');
  end if;
  if p_consent is distinct from true then
    return jsonb_build_object('ok', false, 'code', 'consent_required');
  end if;

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
    select count(*) into v_recent from public.newsletter_subscribers
    where client_hash = v_hash and updated_at > now() - interval '10 minutes';
    if v_recent >= 10 then
      return jsonb_build_object('ok', false, 'code', 'rate_limited');
    end if;
  end if;

  select * into v_row from public.newsletter_subscribers where email = v_email;
  if found then
    if v_row.status = 'subscribed' then
      return jsonb_build_object('ok', true, 'code', 'already_subscribed');
    end if;
    update public.newsletter_subscribers
    set status = 'subscribed', consent_at = now(), unsubscribed_at = null, client_hash = v_hash
    where id = v_row.id;
    return jsonb_build_object('ok', true, 'code', 'resubscribed');
  end if;

  begin
    insert into public.newsletter_subscribers (email, consent_at, client_hash) values (v_email, now(), v_hash);
  exception when unique_violation then
    return jsonb_build_object('ok', true, 'code', 'already_subscribed');   -- deux envois simultanés
  end;
  return jsonb_build_object('ok', true, 'code', 'subscribed');
end $$;

create or replace function public.newsletter_unsubscribe(p_token uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_token is null then
    return jsonb_build_object('ok', false, 'code', 'invalid_token');
  end if;
  update public.newsletter_subscribers
  set status = 'unsubscribed', unsubscribed_at = coalesce(unsubscribed_at, now())
  where unsubscribe_token = p_token;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'invalid_token');
  end if;
  return jsonb_build_object('ok', true, 'code', 'unsubscribed');
end $$;

revoke all on function public.newsletter_subscribe(text, boolean, text) from public;
revoke all on function public.newsletter_unsubscribe(uuid) from public;
grant execute on function public.newsletter_subscribe(text, boolean, text) to anon, authenticated;
grant execute on function public.newsletter_unsubscribe(uuid) to anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 8. ADMINISTRATION — schéma lf_admin, NON exposé par l'API (SQL Editor du dashboard uniquement)
--      select lf_admin.close_voting();             -- ferme les votes (classement conservé)
--      select lf_admin.open_voting();              -- rouvre les votes
--      select lf_admin.set_candidate('plva', false); -- retire / remet une création de la compétition
--      select lf_admin.select_creation('world-love'); -- désigne la création retenue (après fermeture)
-- ─────────────────────────────────────────────────────────────────────────
create schema if not exists lf_admin;
revoke all on schema lf_admin from public;
revoke all on schema lf_admin from anon, authenticated;

create or replace function lf_admin.close_voting()
returns text language plpgsql security definer set search_path = '' as $$
begin
  update public.drop_settings set vote_status = 'closed' where id = 1 and vote_status = 'open';
  update public.creations set vote_status = 'voting_closed' where is_candidate and vote_status = 'voting_open';
  return 'Votes fermés. Classement et scores restent visibles ; aucun vote n''a été supprimé.';
end $$;

create or replace function lf_admin.open_voting()
returns text language plpgsql security definer set search_path = '' as $$
begin
  update public.drop_settings
  set vote_status = 'open', closes_at = null, opens_at = coalesce(opens_at, now())
  where id = 1;
  update public.creations set vote_status = 'voting_open'
  where is_candidate and vote_status in ('candidate', 'voting_closed');
  return 'Votes ouverts jusqu''à fermeture manuelle.';
end $$;

create or replace function lf_admin.set_candidate(p_slug text, p_candidate boolean)
returns text language plpgsql security definer set search_path = '' as $$
declare v_open boolean := (select vote_status = 'open' from public.drop_settings where id = 1);
begin
  if exists (select 1 from public.drops d where d.slug = p_slug and d.status in ('current', 'archived')) then
    raise exception 'La création % est un drop (actuel ou ancien) : elle ne peut pas être candidate.', p_slug;
  end if;
  update public.creations
  set is_candidate = p_candidate,
      status = case when p_candidate then 'candidate' else 'preparing' end,
      vote_status = case when not p_candidate then null when v_open then 'voting_open' else 'candidate' end
  where slug = p_slug;
  if not found then raise exception 'Création inconnue : %', p_slug; end if;
  return format('%s : candidate = %s (votes existants conservés).', p_slug, p_candidate);
end $$;

create or replace function lf_admin.select_creation(p_slug text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  select id into v_id from public.creations where slug = p_slug and is_candidate;
  if v_id is null then raise exception 'Création candidate inconnue : %', p_slug; end if;
  update public.drop_settings
  set vote_status = 'announced', winner_creation_id = v_id, winner_announced_at = now()
  where id = 1;
  update public.creations set vote_status = 'voting_closed' where is_candidate and vote_status = 'voting_open';
  update public.creations set vote_status = 'selected' where id = v_id;
  return format('%s retenue. Les votes sont fermés et conservés.', p_slug);
end $$;

revoke all on all functions in schema lf_admin from public, anon, authenticated;
