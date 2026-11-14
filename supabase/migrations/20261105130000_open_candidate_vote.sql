-- Love&Faith — réouverture durable du vote pour toutes les créations candidates.
-- À exécuter après la migration communautaire et seed_creations.sql.
-- Les lignes de votes ne sont ni modifiées ni supprimées.

create table if not exists public.drop_announcement_history (
  drop_name    text not null,
  winner_slug  text not null,
  announced_at timestamptz not null,
  archived_at  timestamptz not null default now(),
  primary key (drop_name, winner_slug, announced_at)
);

revoke all on public.drop_announcement_history from public, anon, authenticated;

insert into public.drop_announcement_history (drop_name, winner_slug, announced_at)
select d.drop_name, c.slug, coalesce(d.winner_announced_at, d.updated_at, now())
from public.drop_settings d
join public.creations c on c.id = d.winner_creation_id
where d.id = 1 and d.winner_creation_id is not null
on conflict do nothing;

insert into public.creations
  (slug, name, description, icon_path, front_mockup_path, back_mockup_path,
   garment_type, garment_color, is_active, is_candidate, status, sort_order)
values
  ('batman-drop-01', 'Batman', 'DROP #01 — précommandes ouvertes.',
   '/creations/love-in-darkness/icon.webp',
   '/creations/love-in-darkness/front.webp',
   '/creations/love-in-darkness/back.webp',
   'longsleeve', '#f4f4f4', true, false, 'preparing', 0)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  icon_path = excluded.icon_path,
  front_mockup_path = excluded.front_mockup_path,
  back_mockup_path = excluded.back_mockup_path,
  is_active = true,
  is_candidate = false,
  status = 'preparing',
  sort_order = 0;

update public.creations
set is_candidate = false, status = 'historic'
where slug = 'masks-and-hearts';

update public.creations
set is_candidate = false, status = 'preparing'
where slug = 'batman-drop-01';

update public.creations
set is_candidate = true, status = 'candidate'
where is_active
  and status <> 'historic'
  and slug <> 'batman-drop-01';

-- Pas de closes_at : seule une mise à jour manuelle de vote_status fermera le vote.
-- L'annonce précédente est archivée ci-dessus avant le démarrage du nouveau cycle.
update public.drop_settings
set vote_status = 'open',
    opens_at = null,
    closes_at = null,
    winner_creation_id = null,
    winner_announced_at = null
where id = 1;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'drop_settings_manual_closure_only'
      and conrelid = 'public.drop_settings'::regclass
  ) then
    alter table public.drop_settings
      add constraint drop_settings_manual_closure_only check (closes_at is null);
  end if;
end $$;
