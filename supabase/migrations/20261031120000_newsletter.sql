-- ═══════════════════════════════════════════════════════════════════════════
-- Love&Faith — Newsletter (inscription à l'application)
-- À exécuter APRÈS 20261029120000_community_vote.sql. Idempotent, non destructif :
-- crée la table si elle n'existe pas (nouveau projet) ou durcit l'existante (ancien projet), sans toucher aux e-mails.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.newsletter (
  id         uuid primary key default gen_random_uuid(),
  email      text not null unique,
  created_at timestamptz not null default now()
);

alter table public.newsletter enable row level security;

-- Moindre privilège : le site peut seulement AJOUTER une adresse, jamais lire, modifier ni supprimer la liste.
revoke all on public.newsletter from anon, authenticated;
grant insert (email) on public.newsletter to anon, authenticated;

drop policy if exists "newsletter_insert_public" on public.newsletter;
create policy "newsletter_insert_public" on public.newsletter
  for insert to anon, authenticated
  with check (
    char_length(email) between 3 and 254
    and email = lower(btrim(email))
    and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  );
