/**
 * Référencement Love&Faith : métadonnées de chaque page, données structurées et plan du site.
 * Utilisé à l'exécution (src/components/RouteSeo.jsx) ET au build (scripts/vite-seo-plugin.mjs), qui écrit une page
 * HTML par route avec ses balises déjà en place : les moteurs et les aperçus de liens les lisent sans JavaScript.
 *
 * Domaine : VITE_SITE_URL (.env / Vercel) — par défaut le domaine de production ci-dessous.
 */
import { CREATIONS } from './creations';
import { SOCIALS } from './socials';

const ENV_URL = typeof import.meta !== 'undefined' ? import.meta.env?.VITE_SITE_URL : undefined;
export const SITE_URL = (ENV_URL || 'https://www.lov-and-faith.com').replace(/\/+$/, '');

export const SITE_NAME = 'Love&Faith';
/** Toutes les façons dont on tape la marque dans un moteur de recherche. */
export const SITE_ALT_NAMES = ['Love and Faith', 'Love & Faith', 'LoveFaith', 'Lov and Faith'];
export const OG_IMAGE = '/brand/og-image.jpg';
export const OG_IMAGE_ALT = 'Love&Faith (Love and Faith) — logo de la marque';

const DEFAULT_DESCRIPTION =
  'Love&Faith (Love and Faith), marque de vêtements streetwear inspirée des comics : amour, foi et partage. '
  + 'Découvre le drop actuel et vote pour la suite.';

const STATIC_ROUTES = {
  '/propager': {
    title: "Love&Faith — Love and Faith, marque de vêtements streetwear | Propager l'amour",
    description: DEFAULT_DESCRIPTION,
    priority: '1.0',
    changefreq: 'weekly',
  },
  '/a-propos': {
    title: "À propos — L'histoire de Love&Faith (Love and Faith)",
    description:
      "Love&Faith, l'histoire de deux frères relevés par l'amour et la foi. Nos valeurs : amour, foi, bienveillance, "
      + 'solidarité et partage.',
    priority: '0.8',
    changefreq: 'monthly',
  },
  '/chemin': {
    title: "Le chemin de l'amour — Classement des votes Love&Faith",
    description:
      'Classement en direct des créations Love&Faith (Love and Faith) : votes de la communauté, précommandes du drop '
      + 'actuel et prochaines étapes.',
    priority: '0.8',
    changefreq: 'daily',
  },
  '/confidentialite': {
    title: 'Politique de confidentialité — Love&Faith',
    description: 'Comment Love&Faith (Love and Faith) collecte, utilise et protège tes données personnelles.',
    priority: '0.2',
    changefreq: 'yearly',
  },
  '/mentions-legales': {
    title: 'Mentions légales — Love&Faith',
    description: 'Mentions légales du site Love&Faith (Love and Faith).',
    priority: '0.2',
    changefreq: 'yearly',
  },
};

/** Pages à ne pas indexer (liens personnels envoyés par e-mail). */
const NOINDEX = ['/newsletter/desinscription'];

function creationSeo(c) {
  const label = c.isCurrentDrop ? 'drop actuel, précommandes ouvertes' : c.status === 'historic' ? 'ancien drop' : 'création candidate au prochain drop';
  const story = (c.story?.[0] ?? '').replace(/\s+/g, ' ').trim();
  const intro = `${c.name}${c.subtitle ? ` (${c.subtitle})` : ''} — ${label} Love&Faith (Love and Faith).`;
  const description = `${intro} ${c.tagline ? `« ${c.tagline} ». ` : ''}${story}`;
  return {
    title: `${c.name}${c.subtitle ? ` — ${c.subtitle}` : ''} | T-shirt Love&Faith`,
    description: description.length > 160 ? `${description.slice(0, 157).replace(/\s+\S*$/, '')}…` : description,
    image: c.mockups.front,
    priority: c.isCurrentDrop ? '0.9' : '0.7',
    changefreq: 'weekly',
  };
}

/** Métadonnées d'une URL (chemin sans domaine). */
export function getRouteSeo(pathname) {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (NOINDEX.includes(path)) return { title: `${SITE_NAME}`, description: DEFAULT_DESCRIPTION, path, noindex: true };
  if (path === '/') return { ...STATIC_ROUTES['/propager'], path: '/propager' };
  const m = path.match(/^\/propager\/([^/]+)$/);
  if (m) {
    const c = CREATIONS.find((it) => it.slug === m[1]);
    if (c) return { ...creationSeo(c), path, creation: c };
  }
  if (STATIC_ROUTES[path]) return { ...STATIC_ROUTES[path], path };
  return { ...STATIC_ROUTES['/propager'], path: '/propager' };
}

/** Toutes les URL indexables (plan du site + pages HTML générées au build). */
export function getIndexableRoutes() {
  return [...Object.keys(STATIC_ROUTES), ...CREATIONS.map((c) => `/propager/${c.slug}`)];
}

export const absoluteUrl = (path) => (/^https?:/.test(path) ? path : `${SITE_URL}${path.startsWith('/') ? '' : '/'}${path}`);

/** Données structurées schema.org (JSON-LD) : marque, site et, sur une fiche, le vêtement. */
export function getJsonLd(seo) {
  const org = {
    '@type': ['Organization', 'Brand'],
    '@id': `${SITE_URL}/#organisation`,
    name: SITE_NAME,
    alternateName: SITE_ALT_NAMES,
    url: `${SITE_URL}/`,
    logo: absoluteUrl('/brand/icon-512.png'),
    image: absoluteUrl(OG_IMAGE),
    description: DEFAULT_DESCRIPTION,
    slogan: 'Un grand amour vient avec de grandes responsabilités.',
    sameAs: SOCIALS.map((s) => s.url.split('?')[0]),
  };
  const site = {
    '@type': 'WebSite',
    '@id': `${SITE_URL}/#site`,
    name: SITE_NAME,
    alternateName: SITE_ALT_NAMES,
    url: `${SITE_URL}/`,
    inLanguage: 'fr-FR',
    publisher: { '@id': `${SITE_URL}/#organisation` },
  };
  const graph = [org, site];
  const c = seo.creation;
  if (c) {
    graph.push({
      '@type': 'CreativeWork',
      '@id': `${absoluteUrl(seo.path)}#creation`,
      name: `${c.name} — Love&Faith`,
      description: seo.description,
      image: [absoluteUrl(c.mockups.front), absoluteUrl(c.mockups.back)],
      url: absoluteUrl(seo.path),
      genre: 'Streetwear',
      creator: { '@id': `${SITE_URL}/#organisation` },
      brand: { '@id': `${SITE_URL}/#organisation` },
    });
  }
  graph.push({
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: SITE_NAME, item: `${SITE_URL}/propager` },
      ...(c ? [{ '@type': 'ListItem', position: 2, name: c.name, item: absoluteUrl(seo.path) }] : []),
    ],
  });
  return { '@context': 'https://schema.org', '@graph': graph };
}

/**
 * Balises <head> d'une page, sous une forme neutre : { tag, attrs } (meta / link).
 * La clé d'identification (name, property ou rel) permet de les remplacer à chaque navigation.
 */
export function getHeadTags(seo) {
  const url = absoluteUrl(seo.path);
  const image = absoluteUrl(seo.image ?? OG_IMAGE);
  const meta = (key, value, content) => ({ tag: 'meta', attrs: { [key]: value, content } });
  return [
    meta('name', 'description', seo.description),
    meta('name', 'robots', seo.noindex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large'),
    { tag: 'link', attrs: { rel: 'canonical', href: url } },
    meta('property', 'og:type', seo.creation ? 'article' : 'website'),
    meta('property', 'og:site_name', SITE_NAME),
    meta('property', 'og:locale', 'fr_FR'),
    meta('property', 'og:title', seo.title),
    meta('property', 'og:description', seo.description),
    meta('property', 'og:url', url),
    meta('property', 'og:image', image),
    meta('property', 'og:image:alt', seo.creation ? `${seo.creation.name} — Love&Faith` : OG_IMAGE_ALT),
    meta('name', 'twitter:card', 'summary_large_image'),
    meta('name', 'twitter:title', seo.title),
    meta('name', 'twitter:description', seo.description),
    meta('name', 'twitter:image', image),
  ];
}
