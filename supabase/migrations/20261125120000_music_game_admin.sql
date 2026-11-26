-- ════════════════════════════════════════════════════════════════════════════
-- Love&Faith — Le son de l'amour, Jouer avec l'amour, tableau de bord administrateur
-- Migration ADDITIVE : aucune table existante n'est modifiée, aucune donnée supprimée.
--
--   • public.music_tracks          bibliothèque musicale (lecture publique des morceaux publiés uniquement)
--   • lf_private.analytics_events  mesure d'audience anonyme (schéma privé : aucune lecture publique)
--   • public.track_events(jsonb)   seule porte d'écriture publique : événements autorisés, validés et bornés
--   • lf_private.admin_users       comptes Supabase Auth autorisés au tableau de bord
--   • public.is_admin() / public.admin_dashboard(period)  statistiques agrégées, refusées (42501) hors administrateur
--
-- RGPD : aucune adresse IP, aucun nom, aucun e-mail dans l'analytics. Identifiant de visiteur aléatoire
-- (renouvelé tous les 13 mois côté navigateur), événements conservés 25 mois puis supprimés automatiquement.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Bibliothèque musicale ──
create table if not exists public.music_tracks (
  id                text primary key check (id ~ '^[a-z0-9-]{2,80}$'),
  artist            text not null check (char_length(btrim(artist)) between 1 and 80),
  title             text not null check (char_length(btrim(title)) between 1 and 120),
  file_path         text not null check (file_path ~ '^/music/[a-z0-9-]+\.(mp3|m4a)$'),
  mime_type         text not null default 'audio/mpeg' check (mime_type in ('audio/mpeg', 'audio/mp4')),
  cover_path        text check (cover_path is null or cover_path ~ '^/music/covers/[a-z0-9-]+\.webp$'),
  duration_seconds  numeric(8, 1) check (duration_seconds is null or duration_seconds > 0),
  position          integer not null default 0,
  is_published      boolean not null default true,
  added_at          timestamptz not null default now()
);
comment on table public.music_tracks is
  'Morceaux de « Le son de l''amour ». Retirer un morceau : is_published = false. Ajout : npm run music:import puis supabase/seed_music_tracks.sql.';
create index if not exists music_tracks_published_idx on public.music_tracks (is_published, position);

alter table public.music_tracks enable row level security;
revoke all on public.music_tracks from anon, authenticated;
grant select on public.music_tracks to anon, authenticated;
drop policy if exists "Morceaux publiés lisibles par tous" on public.music_tracks;
create policy "Morceaux publiés lisibles par tous" on public.music_tracks
  for select to anon, authenticated using (is_published);

insert into public.music_tracks (id, artist, title, file_path, mime_type, cover_path, duration_seconds, position)
values
  ('barty-pour-oublier', 'Barty', 'Pour oublier', '/music/barty-pour-oublier.m4a', 'audio/mp4', null, 110.3, 1),
  ('cooper-la-haine-1', 'Cooper', 'La haine #1', '/music/cooper-la-haine-1.mp3', 'audio/mpeg', null, 187.9, 2),
  ('cooper-la-haine-2', 'Cooper', 'La haine #2', '/music/cooper-la-haine-2.mp3', 'audio/mpeg', null, 132.7, 3),
  ('mwl-croire-en-nous', 'MWL', 'Croire en nous', '/music/mwl-croire-en-nous.mp3', 'audio/mpeg', null, 166.3, 4),
  ('mwl-death-note', 'MWL', 'Death note', '/music/mwl-death-note.mp3', 'audio/mpeg', '/music/covers/mwl-death-note.webp', 188.8, 5),
  ('mwl-encorps', 'MWL', 'EnCORPS', '/music/mwl-encorps.mp3', 'audio/mpeg', '/music/covers/mwl-encorps.webp', 146.4, 6),
  ('mwl-malavivre', 'MWL', 'Malavivre', '/music/mwl-malavivre.mp3', 'audio/mpeg', '/music/covers/mwl-malavivre.webp', 132.8, 7),
  ('mwl-ne-m-abandonne-pas', 'MWL', 'Ne m''abandonne pas', '/music/mwl-ne-m-abandonne-pas.mp3', 'audio/mpeg', null, 158.5, 8),
  ('mwl-realise-mes-voeux', 'MWL', 'Réalise mes voeux', '/music/mwl-realise-mes-voeux.mp3', 'audio/mpeg', null, 234.2, 9),
  ('mwl-sensation', 'MWL', 'Sensation', '/music/mwl-sensation.mp3', 'audio/mpeg', '/music/covers/mwl-sensation.webp', 150.0, 10),
  ('rakeem-duc', 'Rakeem', 'DUC', '/music/rakeem-duc.m4a', 'audio/mp4', null, 190.5, 11),
  ('rakeem-sonbody', 'Rakeem', 'SonBody', '/music/rakeem-sonbody.m4a', 'audio/mp4', null, 104.8, 12)
on conflict (id) do nothing;

-- ── 2. Mesure d'audience anonyme ──
create table if not exists lf_private.analytics_events (
  id           bigint generated always as identity primary key,
  occurred_at  timestamptz not null default now(),     -- heure du serveur (jamais celle du navigateur)
  visitor_id   uuid not null,                          -- aléatoire, sans lien avec une identité
  session_id   uuid not null,                          -- nouvelle visite après 30 min d'inactivité
  event_type   text not null check (event_type in (
                 'page_view', 'page_time',
                 'game_open', 'game_ready', 'game_run_end', 'game_fullscreen', 'game_external',
                 'music_start', 'music_listen', 'music_complete', 'music_time', 'music_pause', 'music_skip')),
  page_key     text check (page_key ~ '^[a-z0-9:-]{1,80}$'),
  device       text check (device in ('mobile', 'tablet', 'desktop')),
  track_id     text check (track_id ~ '^[a-z0-9-]{2,80}$'),
  value        numeric(12, 2) check (value is null or value between 0 and 100000000),
  mode         text check (mode ~ '^[A-Za-z0-9 _.-]{1,40}$')
);
comment on table lf_private.analytics_events is
  'Événements de mesure d''audience Love&Faith (aucune donnée personnelle). Écriture : public.track_events. '
  'value = secondes (page_time, music_time) ou score (game_run_end). Conservation : 25 mois.';
create index if not exists analytics_events_time_idx on lf_private.analytics_events (occurred_at);
create index if not exists analytics_events_type_time_idx on lf_private.analytics_events (event_type, occurred_at);
create index if not exists analytics_events_page_idx on lf_private.analytics_events (page_key, occurred_at) where page_key is not null;
create index if not exists analytics_events_track_idx on lf_private.analytics_events (track_id, event_type) where track_id is not null;
create index if not exists analytics_events_session_idx on lf_private.analytics_events (session_id, occurred_at);
alter table lf_private.analytics_events enable row level security;
revoke all on lf_private.analytics_events from public;

create or replace function public.track_events(p_events jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_event   jsonb;
  v_count   integer := 0;
  v_recent  integer;
  v_session uuid;
  v_visitor uuid;
begin
  if jsonb_typeof(p_events) <> 'array' or jsonb_array_length(p_events) = 0 then
    return jsonb_build_object('ok', false, 'code', 'invalid_input');
  end if;
  if jsonb_array_length(p_events) > 25 then
    return jsonb_build_object('ok', false, 'code', 'too_many');
  end if;

  for v_event in select * from jsonb_array_elements(p_events) loop
    begin
      v_session := (v_event ->> 'session_id')::uuid;
      v_visitor := (v_event ->> 'visitor_id')::uuid;
    exception when others then
      continue;
    end;
    if v_session is null or v_visitor is null then continue; end if;

    -- Anti-abus : 600 événements maximum par visite et par heure
    select count(*) into v_recent from lf_private.analytics_events
    where session_id = v_session and occurred_at > now() - interval '1 hour';
    if v_recent >= 600 then
      return jsonb_build_object('ok', false, 'code', 'rate_limited', 'stored', v_count);
    end if;

    begin
      insert into lf_private.analytics_events (visitor_id, session_id, event_type, page_key, device, track_id, value, mode)
      values (
        v_visitor, v_session,
        v_event ->> 'type',
        nullif(left(v_event ->> 'page', 80), ''),
        nullif(v_event ->> 'device', ''),
        nullif(left(v_event ->> 'track', 80), ''),
        case when jsonb_typeof(v_event -> 'value') = 'number'
             then least(greatest((v_event ->> 'value')::numeric, 0), 100000000) end,
        nullif(left(v_event ->> 'mode', 40), '')
      );
      v_count := v_count + 1;
    exception when check_violation or not_null_violation or invalid_text_representation or numeric_value_out_of_range then
      continue; -- événement non autorisé ou mal formé : ignoré
    end;
  end loop;

  -- Conservation limitée (25 mois), purge occasionnelle sans tâche planifiée
  if random() < 0.002 then
    delete from lf_private.analytics_events where occurred_at < now() - interval '25 months';
  end if;

  return jsonb_build_object('ok', true, 'stored', v_count);
end $$;

revoke all on function public.track_events(jsonb) from public;
grant execute on function public.track_events(jsonb) to anon, authenticated;

-- ── 3. Administrateurs ──
create table if not exists lf_private.admin_users (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table lf_private.admin_users enable row level security;
revoke all on lf_private.admin_users from public;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
     and exists (select 1 from lf_private.admin_users a where a.user_id = auth.uid());
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- À exécuter par le propriétaire dans l'éditeur SQL Supabase, après avoir créé le compte (Authentication → Users) :
--   select lf_admin.grant_admin('adresse@exemple.fr');
create or replace function lf_admin.grant_admin(p_email text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select id into v_id from auth.users where lower(email) = lower(btrim(p_email));
  if v_id is null then
    raise exception 'Aucun compte Supabase Auth pour %. Crée-le d''abord dans Authentication → Users.', p_email;
  end if;
  insert into lf_private.admin_users (user_id) values (v_id) on conflict do nothing;
  return 'Administrateur ajouté : ' || p_email;
end $$;
revoke all on function lf_admin.grant_admin(text) from public;

create or replace function lf_admin.revoke_admin(p_email text)
returns text
language sql
security definer
set search_path = ''
as $$
  delete from lf_private.admin_users where user_id in (select id from auth.users where lower(email) = lower(btrim(p_email)));
  select 'Accès retiré : ' || p_email;
$$;
revoke all on function lf_admin.revoke_admin(text) from public;

-- ── 4. Tableau de bord : statistiques agrégées, calculées dans la base ──
-- p_period : 'today' | '7d' | '30d' | '90d' | 'all'. Aucune donnée personnelle n'est renvoyée.
create or replace function public.admin_dashboard(p_period text default '30d')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_to      timestamptz := now();
  v_from    timestamptz;
  v_prev    timestamptz;
  v_launch  timestamptz;
  v_bucket  text;
  v_result  jsonb;
begin
  if not public.is_admin() then
    raise exception 'Accès réservé à l''administrateur' using errcode = '42501';
  end if;

  select least(
    coalesce((select min(occurred_at) from lf_private.analytics_events), now()),
    coalesce((select min(created_at) from public.drop_votes), now()),
    coalesce((select min(created_at) from public.newsletter_subscribers), now()),
    coalesce((select min(created_at) from public.preorder_registrations), now())
  ) into v_launch;

  v_from := case p_period
    when 'today' then date_trunc('day', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris'
    when '7d' then now() - interval '7 days'
    when '30d' then now() - interval '30 days'
    when '90d' then now() - interval '90 days'
    when 'all' then v_launch
    else null end;
  if v_from is null then
    raise exception 'Période inconnue : %', p_period using errcode = '22023';
  end if;
  v_prev := case when p_period = 'all' then null else v_from - (v_to - v_from) end;
  v_bucket := case when p_period = 'today' then 'hour' else 'day' end;

  with
  ev as (select * from lf_private.analytics_events where occurred_at >= v_from and occurred_at < v_to),
  ev_prev as (select * from lf_private.analytics_events where v_prev is not null and occurred_at >= v_prev and occurred_at < v_from),
  pv as (select * from ev where event_type = 'page_view'),
  days as (
    select generate_series(
      date_trunc(v_bucket, v_from at time zone 'Europe/Paris'),
      date_trunc(v_bucket, v_to at time zone 'Europe/Paris'),
      ('1 ' || v_bucket)::interval) as d
  ),
  totals as (
    select
      (select count(distinct visitor_id) from pv) as unique_visitors,
      (select count(*) from (select distinct visitor_id, date_trunc('day', occurred_at at time zone 'Europe/Paris') from pv) x) as daily_visitors,
      (select count(distinct session_id) from pv) as sessions,
      (select count(*) from pv) as page_views,
      (select count(distinct visitor_id) from ev where event_type = 'game_ready') as game_players,
      (select count(distinct visitor_id) from ev where event_type = 'game_open') as game_openers,
      (select count(*) from ev where event_type = 'music_start') as music_plays,
      (select count(*) from public.drop_votes where created_at >= v_from and created_at < v_to) as votes,
      (select count(*) from public.newsletter_subscribers where created_at >= v_from and created_at < v_to) as newsletter_new,
      (select count(*) from public.preorder_registrations where created_at >= v_from and created_at < v_to) as preorders_new
  ),
  totals_prev as (
    select
      (select count(distinct visitor_id) from ev_prev where event_type = 'page_view') as unique_visitors,
      (select count(*) from (select distinct visitor_id, date_trunc('day', occurred_at at time zone 'Europe/Paris') from ev_prev where event_type = 'page_view') x) as daily_visitors,
      (select count(distinct session_id) from ev_prev where event_type = 'page_view') as sessions,
      (select count(*) from ev_prev where event_type = 'page_view') as page_views,
      (select count(distinct visitor_id) from ev_prev where event_type = 'game_ready') as game_players,
      (select count(distinct visitor_id) from ev_prev where event_type = 'game_open') as game_openers,
      (select count(*) from ev_prev where event_type = 'music_start') as music_plays,
      (select count(*) from public.drop_votes where v_prev is not null and created_at >= v_prev and created_at < v_from) as votes,
      (select count(*) from public.newsletter_subscribers where v_prev is not null and created_at >= v_prev and created_at < v_from) as newsletter_new,
      (select count(*) from public.preorder_registrations where v_prev is not null and created_at >= v_prev and created_at < v_from) as preorders_new
  ),
  series as (
    select d,
      (select count(distinct visitor_id) from pv where date_trunc(v_bucket, occurred_at at time zone 'Europe/Paris') = d) as visitors,
      (select count(distinct session_id) from pv where date_trunc(v_bucket, occurred_at at time zone 'Europe/Paris') = d) as sessions,
      (select count(*) from pv where date_trunc(v_bucket, occurred_at at time zone 'Europe/Paris') = d) as page_views,
      (select count(distinct session_id) from ev where event_type = 'game_open' and date_trunc(v_bucket, occurred_at at time zone 'Europe/Paris') = d) as game_sessions,
      (select count(*) from ev where event_type = 'music_start' and date_trunc(v_bucket, occurred_at at time zone 'Europe/Paris') = d) as music_plays,
      (select count(*) from public.drop_votes v where v.created_at >= v_from and date_trunc(v_bucket, v.created_at at time zone 'Europe/Paris') = d) as votes,
      (select count(*) from public.newsletter_subscribers n where n.created_at >= v_from and date_trunc(v_bucket, n.created_at at time zone 'Europe/Paris') = d) as newsletter_new,
      (select count(*) from public.newsletter_subscribers n where n.unsubscribed_at >= v_from and date_trunc(v_bucket, n.unsubscribed_at at time zone 'Europe/Paris') = d) as newsletter_unsub,
      (select count(*) from public.preorder_registrations r where r.created_at >= v_from and date_trunc(v_bucket, r.created_at at time zone 'Europe/Paris') = d) as preorders
    from days
  ),
  pages as (
    select page_key,
      count(*) filter (where event_type = 'page_view') as views,
      count(distinct visitor_id) filter (where event_type = 'page_view') as visitors,
      round(avg(value) filter (where event_type = 'page_time'), 1) as avg_seconds
    from ev where page_key is not null and event_type in ('page_view', 'page_time')
    group by page_key
  ),
  music as (
    select t.id, t.artist, t.title,
      count(*) filter (where e.event_type = 'music_start') as starts,
      count(*) filter (where e.event_type = 'music_listen') as listens,
      count(*) filter (where e.event_type = 'music_complete') as completes,
      coalesce(sum(e.value) filter (where e.event_type = 'music_time'), 0) as seconds
    from public.music_tracks t
    left join ev e on e.track_id = t.id
    group by t.id, t.artist, t.title
  ),
  votes_by_creation as (
    select c.slug, c.name, count(v.id) as votes
    from public.creations c
    left join public.drop_votes v on v.candidate_id = c.id and v.created_at >= v_from and v.created_at < v_to
    where c.is_candidate or exists (select 1 from public.drop_votes v2 where v2.candidate_id = c.id)
    group by c.slug, c.name
  )
  select jsonb_build_object(
    'period', p_period,
    'from', v_from,
    'to', v_to,
    'launch', v_launch,
    'bucket', v_bucket,
    'totals', (select to_jsonb(totals) from totals),
    'previous', case when v_prev is null then null else (select to_jsonb(totals_prev) from totals_prev) end,
    'all_time', jsonb_build_object(
      'votes', (select count(*) from public.drop_votes),
      'newsletter_subscribed', (select count(*) from public.newsletter_subscribers where status = 'subscribed'),
      'newsletter_unsubscribed', (select count(*) from public.newsletter_subscribers where status = 'unsubscribed'),
      'preorders', (select count(*) from public.preorder_registrations),
      'creations_with_votes', (select count(distinct candidate_id) from public.drop_votes)
    ),
    'series', coalesce((select jsonb_agg(jsonb_build_object(
        'd', to_char(d, case when v_bucket = 'hour' then 'YYYY-MM-DD"T"HH24' else 'YYYY-MM-DD' end),
        'visitors', visitors, 'sessions', sessions, 'page_views', page_views, 'game_sessions', game_sessions,
        'music_plays', music_plays, 'votes', votes, 'newsletter_new', newsletter_new,
        'newsletter_unsub', newsletter_unsub, 'preorders', preorders) order by d) from series), '[]'::jsonb),
    'pages', coalesce((select jsonb_agg(to_jsonb(p) order by p.views desc) from pages p where p.views > 0), '[]'::jsonb),
    'game', jsonb_build_object(
      'page_visitors', (select count(distinct visitor_id) from pv where page_key = 'jouer'),
      'page_views', (select count(*) from pv where page_key = 'jouer'),
      'opens', (select count(*) from ev where event_type = 'game_open'),
      'sessions', (select count(distinct session_id) from ev where event_type = 'game_open'),
      'ready', (select count(*) from ev where event_type = 'game_ready'),
      'players', (select count(distinct visitor_id) from ev where event_type = 'game_ready'),
      'fullscreen', (select count(*) from ev where event_type = 'game_fullscreen'),
      'external', (select count(*) from ev where event_type = 'game_external'),
      'run_ends', (select count(*) from ev where event_type = 'game_run_end'),
      'best_score', (select max(value) from ev where event_type = 'game_run_end'),
      'avg_score', (select round(avg(value), 1) from ev where event_type = 'game_run_end'),
      'devices', coalesce((select jsonb_object_agg(device, n) from (
          select coalesce(device, 'inconnu') as device, count(distinct session_id) as n
          from ev where event_type = 'game_open' group by 1) x), '{}'::jsonb)
    ),
    'music', jsonb_build_object(
      'starts', (select count(*) from ev where event_type = 'music_start'),
      'listens', (select count(*) from ev where event_type = 'music_listen'),
      'completes', (select count(*) from ev where event_type = 'music_complete'),
      'seconds', (select coalesce(sum(value), 0) from ev where event_type = 'music_time'),
      'pauses', (select count(*) from ev where event_type = 'music_pause'),
      'skips', (select count(*) from ev where event_type = 'music_skip'),
      'tracks', coalesce((select jsonb_agg(to_jsonb(m) order by m.starts desc, m.listens desc, m.title) from music m), '[]'::jsonb),
      'artists', coalesce((select jsonb_agg(to_jsonb(a) order by a.starts desc, a.artist) from (
          select artist, sum(starts) as starts, sum(listens) as listens, sum(seconds) as seconds from music group by artist) a), '[]'::jsonb)
    ),
    'votes', coalesce((select jsonb_agg(to_jsonb(v) order by v.votes desc, v.name) from votes_by_creation v), '[]'::jsonb),
    'preorders', jsonb_build_object(
      'by_drop', coalesce((select jsonb_agg(jsonb_build_object('slug', d.slug, 'name', d.name, 'people', x.people) order by x.people desc)
          from (select drop_id, count(*) as people from public.preorder_registrations group by drop_id) x
          join public.drops d on d.id = x.drop_id), '[]'::jsonb),
      'by_status', coalesce((select jsonb_object_agg(status, n) from (
          select status, count(*) as n from public.preorder_registrations group by status) s), '{}'::jsonb)
    )
  ) into v_result;

  return v_result;
end $$;

revoke all on function public.admin_dashboard(text) from public;
grant execute on function public.admin_dashboard(text) to authenticated;
