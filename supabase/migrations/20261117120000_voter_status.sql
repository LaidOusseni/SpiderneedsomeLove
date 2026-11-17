-- ════════════════════════════════════════════════════════════════════════════
-- Love&Faith — « Vous avez déjà voté » : votes d'un visiteur vérifiés dans Supabase
-- Migration ADDITIVE : aucune table existante n'est modifiée, aucune donnée supprimée.
--
-- Principe :
--   • cast_vote_tracked(...) appelle public.cast_vote(...) (règles inchangées : statut du vote, anti-robot,
--     limite de fréquence, UNIQUE (candidate_id, instagram_normalized) contre les doublons) ;
--   • si le vote est accepté — ou déjà enregistré ET que le prénom et le nom correspondent au vote existant —
--     elle remet au navigateur un identifiant aléatoire (voter_token). Seule son empreinte SHA-256 est stockée ;
--   • get_my_votes(token) renvoie les créations pour lesquelles le compte Instagram lié à ce jeton a voté,
--     lues directement dans public.drop_votes (état synchronisé après actualisation, sur tous les appareils).
-- Le navigateur ne conserve ni nom ni Instagram : uniquement le jeton aléatoire.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists lf_private.voter_tokens (
  token_hash            text primary key,
  instagram_normalized  text not null check (instagram_normalized ~ '^[a-z0-9._]{1,30}$'),
  created_at            timestamptz not null default now(),
  last_used_at          timestamptz not null default now()
);
create index if not exists voter_tokens_instagram_idx on lf_private.voter_tokens (instagram_normalized);
revoke all on table lf_private.voter_tokens from public;

create or replace function public.cast_vote_tracked(
  p_creation_slug text,
  p_first_name    text,
  p_last_name     text,
  p_instagram     text,
  p_website       text default null,
  p_voter_token   uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_result  jsonb;
  v_norm    text := public.lf_normalize_instagram(p_instagram);
  v_first   text := lower(left(regexp_replace(btrim(coalesce(p_first_name, '')), '\s+', ' ', 'g'), 60));
  v_last    text := lower(left(regexp_replace(btrim(coalesce(p_last_name, '')), '\s+', ' ', 'g'), 60));
  v_token   uuid;
  v_hash    text;
begin
  v_result := public.cast_vote(p_creation_slug, p_first_name, p_last_name, p_instagram, p_website);

  if v_result ->> 'code' = 'already_voted' then
    -- Le jeton n'est remis que si l'identité correspond au vote existant (pas de consultation des votes d'autrui)
    if not exists (
      select 1 from public.drop_votes v
      join public.creations c on c.id = v.candidate_id
      where c.slug = p_creation_slug and v.instagram_normalized = v_norm
        and lower(v.first_name) = v_first and lower(v.last_name) = v_last
    ) then
      return v_result;
    end if;
  elsif coalesce((v_result ->> 'ok')::boolean, false) is not true then
    return v_result;
  end if;

  -- Réutilise le jeton de l'appareil s'il désigne déjà ce compte, sinon en crée un nouveau
  if p_voter_token is not null then
    v_hash := encode(extensions.digest(p_voter_token::text, 'sha256'), 'hex');
    if exists (select 1 from lf_private.voter_tokens t where t.token_hash = v_hash and t.instagram_normalized = v_norm) then
      update lf_private.voter_tokens set last_used_at = now() where token_hash = v_hash;
      v_token := p_voter_token;
    end if;
  end if;
  if v_token is null then
    v_token := gen_random_uuid();
    insert into lf_private.voter_tokens (token_hash, instagram_normalized)
    values (encode(extensions.digest(v_token::text, 'sha256'), 'hex'), v_norm);
  end if;

  return v_result || jsonb_build_object('voter_token', v_token);
end $$;

create or replace function public.get_my_votes(p_voter_token uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_norm text;
  v_hash text;
begin
  if p_voter_token is null then
    return jsonb_build_object('ok', false, 'code', 'unknown_voter', 'slugs', '[]'::jsonb);
  end if;
  v_hash := encode(extensions.digest(p_voter_token::text, 'sha256'), 'hex');
  update lf_private.voter_tokens set last_used_at = now()
  where token_hash = v_hash
  returning instagram_normalized into v_norm;
  if v_norm is null then
    return jsonb_build_object('ok', false, 'code', 'unknown_voter', 'slugs', '[]'::jsonb);
  end if;
  return jsonb_build_object('ok', true, 'code', 'ok', 'slugs', coalesce((
    select jsonb_agg(distinct c.slug)
    from public.drop_votes v
    join public.creations c on c.id = v.candidate_id
    where v.instagram_normalized = v_norm
  ), '[]'::jsonb));
end $$;

revoke all on function public.cast_vote_tracked(text, text, text, text, text, uuid) from public;
revoke all on function public.get_my_votes(uuid) from public;
grant execute on function public.cast_vote_tracked(text, text, text, text, text, uuid) to anon, authenticated;
grant execute on function public.get_my_votes(uuid) to anon, authenticated;
