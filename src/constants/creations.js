/**
 * Configuration centrale des créations Love&Faith.
 *
 * Ajouter une création :
 *   1. Déclarer ses fichiers sources dans scripts/creation-sources.mjs puis lancer `npm run assets`
 *      (génère public/creations/<slug>/ et la position des motifs dans generated/prints.json).
 *   2. Ajouter une entrée ci-dessous (slug identique) + son histoire dans creationStories.js.
 *   3. Ajouter la ligne correspondante dans Supabase (voir supabase/seed_creations.sql).
 *
 * Remplacer une texture : déposer le nouveau PNG transparent dans public/creations/<slug>/print-front.png
 * (ou print-back.png) et, si son cadrage change, renseigner `garment.prints.front.rect` ci-dessous.
 *
 * Statuts (`status`) :
 *   - 'candidate' : en compétition pour le prochain drop
 *   - 'preparing' : visible mais pas encore ouverte au vote
 *   - 'historic'  : création déjà sortie, consultable mais hors compétition
 * Supabase reste la référence pour le vote : une création n'est votable que si la base l'autorise
 * (creations.is_candidate + status = 'candidate' + vote ouvert dans drop_settings).
 */
import PRINTS from './generated/prints.json';
import { CREATION_STORIES } from './creationStories';

const RAW_CREATIONS = [
  {
    slug: 'heart-of-ice',
    name: 'Heart of Ice',
    status: 'candidate',
    tagline: null, // aucun texte imprimé
    garment: { cut: 'longsleeve' },
  },
  {
    slug: 'love-in-darkness',
    name: 'Love in Darkness',
    status: 'candidate',
    tagline: 'Even in the darkness, love.',
    garment: { cut: 'longsleeve' },
  },
  {
    slug: 'world-love',
    name: 'World Love',
    status: 'candidate',
    tagline: 'Love rules the world',
    garment: { cut: 'longsleeve' },
  },
  {
    slug: 'fabulous-love-and-faith',
    name: 'Fabulous Love&Faith',
    subtitle: 'Casino',
    status: 'candidate',
    tagline: 'No chance, only Love&Faith',
    garment: { cut: 'longsleeve' },
  },
  {
    slug: 'lva',
    name: 'LVA',
    subtitle: 'Les Vrais Amoureux',
    status: 'candidate',
    tagline: 'For real lovers',
    garment: { cut: 'longsleeve' },
  },
  {
    slug: 'plva',
    name: 'PLVA',
    subtitle: 'Pour les Vrais Amoureux',
    status: 'candidate',
    tagline: 'Pour les vrais amoureux',
    garment: { cut: 'longsleeve' },
  },
  {
    slug: 'masks-and-hearts',
    name: 'Masks & Hearts',
    subtitle: 'Tome I',
    status: 'historic',
    tagline: 'Tome I — déjà sorti',
    mockupsAreCovers: true, // galerie = couvertures comics de la V1
    garment: {
      cut: 'tee',
      color: '#f2f2f2',
      // Motif seul (pas de mockup détourable) : placement sur la poitrine
      prints: { front: { rect: [0.3, 0.2, 0.7, 0.47] } },
    },
  },
];

const asset = (slug, file) => `/creations/${slug}/${file}`;

function buildGarment(slug, garment) {
  const meta = PRINTS[slug] ?? {};
  const prints = {};
  for (const side of ['front', 'back']) {
    const rect = garment.prints?.[side]?.rect ?? meta[side]?.rect;
    if (rect) prints[side] = { src: garment.prints?.[side]?.src ?? asset(slug, `print-${side}.png`), rect };
  }
  return {
    cut: garment.cut ?? 'longsleeve',
    color: garment.color ?? meta.fabric ?? '#f2f2f2',
    prints,
  };
}

export const CREATIONS = RAW_CREATIONS.map((c, index) => ({
  ...c,
  index,
  icon: asset(c.slug, 'icon.webp'),
  mockups: { front: asset(c.slug, 'front.webp'), back: asset(c.slug, 'back.webp') },
  garment: buildGarment(c.slug, c.garment ?? {}),
  story: CREATION_STORIES[c.slug]?.story ?? [],
  message: CREATION_STORIES[c.slug]?.message ?? null,
  storyTodo: CREATION_STORIES[c.slug]?.todo ?? null,
}));

export const CANDIDATES = CREATIONS.filter((c) => c.status !== 'historic');

export const getCreation = (slug) => CREATIONS.find((c) => c.slug === slug) ?? null;
