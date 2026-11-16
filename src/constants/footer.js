import { SOCIALS } from './socials';

/**
 * Liens du footer. Les réseaux reprennent les comptes officiels de src/constants/socials.js (aucun compte inventé).
 * Les ancres (#...) défilent jusqu'à la section correspondante (voir ScrollToTop dans App.jsx).
 */
const social = (id, label) => {
  const s = SOCIALS.find((it) => it.id === id);
  return s ? { label: label ?? s.label, href: s.url, external: true } : null;
};

export const FOOTER_COLUMNS = [
  {
    id: 'maison',
    num: '01',
    title: 'Maison',
    links: [
      { label: 'Notre histoire', to: '/a-propos' },
      { label: 'Nos valeurs', to: '/a-propos#valeurs' },
      { label: 'Notre univers', to: '/propager' },
    ],
  },
  {
    id: 'explorer',
    num: '02',
    title: 'Explorer',
    links: [
      { label: "Propager l'amour", to: '/propager' },
      { label: 'Les créations', to: '/propager#creations' },
      { label: "Le chemin de l'amour", to: '/chemin' },
    ],
  },
  {
    id: 'communaute',
    num: '03',
    title: 'Communauté',
    links: [
      { label: 'Contact', to: '/chemin#communaute' },
      { label: 'Newsletter', to: '/chemin#newsletter' },
    ],
  },
  {
    id: 'suivre',
    num: '04',
    title: 'Suivre',
    links: [
      social('instagram'),
      social('tiktok'),
      social('podcast', 'Podcast Love&Share'),
    ].filter(Boolean),
  },
];

export const FOOTER_LEGAL = [
  { label: 'Mentions légales', to: '/mentions-legales' },
  { label: 'En savoir plus', href: 'https://www.5hc.fr/', external: true },
];
