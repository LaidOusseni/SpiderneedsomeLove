-- ═══════════════════════════════════════════════════════════════════════════
-- Love&Faith — Initialisation des créations et du drop
-- À exécuter APRÈS la migration 20261029120000_community_vote.sql.
-- Sans risque si relancé : « on conflict do nothing » → aucune ligne existante
-- n'est remplacée, aucun vote n'est touché.
-- ═══════════════════════════════════════════════════════════════════════════

insert into public.creations
  (slug, name, description, icon_path, front_mockup_path, back_mockup_path,
   garment_type, garment_color, is_active, is_candidate, status, sort_order)
values
  ('heart-of-ice', 'Heart of Ice',
   'Quand l''amour devient une prison glacée.',
   '/creations/heart-of-ice/icon.webp', '/creations/heart-of-ice/front.webp', '/creations/heart-of-ice/back.webp',
   'longsleeve', '#090909', true, true, 'candidate', 1),
  ('love-in-darkness', 'Love in Darkness',
   'Et si Batman choisissait de propager l''amour plutôt que la vengeance ?',
   '/creations/love-in-darkness/icon.webp', '/creations/love-in-darkness/front.webp', '/creations/love-in-darkness/back.webp',
   'longsleeve', '#f4f4f4', true, true, 'candidate', 2),
  ('world-love', 'World Love',
   'L''amour n''a aucune frontière.',
   '/creations/world-love/icon.webp', '/creations/world-love/front.webp', '/creations/world-love/back.webp',
   'longsleeve', '#f4f4f4', true, true, 'candidate', 3),
  ('fabulous-love-and-faith', 'Fabulous Love&Faith',
   'La chance n''existe pas : l''amour et la foi sont notre mise.',
   '/creations/fabulous-love-and-faith/icon.webp', '/creations/fabulous-love-and-faith/front.webp', '/creations/fabulous-love-and-faith/back.webp',
   'longsleeve', '#f4f4f4', true, true, 'candidate', 4),
  ('lva', 'LVA — Les Vrais Amoureux',
   'Le T-shirt originel de Love&Faith.',
   '/creations/lva/icon.webp', '/creations/lva/front.webp', '/creations/lva/back.webp',
   'longsleeve', '#f4f4f4', true, true, 'candidate', 5),
  ('plva', 'PLVA — Pour les Vrais Amoureux',
   'Une vision de l''amour inspirée de Hamza.',
   '/creations/plva/icon.webp', '/creations/plva/front.webp', '/creations/plva/back.webp',
   'longsleeve', '#f4f4f4', true, true, 'candidate', 6),
  ('masks-and-hearts', 'Masks & Hearts',
   'Tome I — déjà sorti.',
   '/creations/masks-and-hearts/icon.webp', '/creations/masks-and-hearts/front.webp', '/creations/masks-and-hearts/back.webp',
   'tee', '#f2f2f2', true, false, 'historic', 7)
on conflict (slug) do nothing;

-- Paramètres du drop : créés en « preparing ».
-- Ouvrir le vote est une décision : exécuter la ligne « update » ci-dessous quand vous êtes prêt.
insert into public.drop_settings (id, drop_name, vote_status)
values (1, 'Prochain drop Love&Faith', 'preparing')
on conflict (id) do nothing;

-- ▶ Ouvrir le vote :
-- update public.drop_settings set vote_status = 'open', opens_at = now() where id = 1;
--
-- ▶ Clôturer le vote (les jauges restent visibles, les boutons de vote se désactivent) :
-- update public.drop_settings set vote_status = 'closed' where id = 1;
--
-- ▶ Désigner officiellement la création retenue :
-- update public.drop_settings
--   set vote_status = 'announced',
--       winner_creation_id = (select id from public.creations where slug = 'world-love'),
--       winner_announced_at = now()
-- where id = 1;
--
-- ▶ Retirer une création de la compétition :
-- update public.creations set is_candidate = false, status = 'preparing' where slug = 'plva';
