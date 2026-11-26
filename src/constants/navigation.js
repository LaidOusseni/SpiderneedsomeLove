export const NAV_LINKS = [
  {
    id: 'propager',
    label: "Propager l'amour",
    path: '/propager',
  },
  {
    id: 'apropos',
    label: "À propos de l'amour",
    path: '/a-propos',
  },
  {
    id: 'chemin',
    label: "Suivez le chemin de l'amour",
    path: '/chemin',
  },
  {
    id: 'jouer',
    label: "Jouer avec l'amour",
    path: '/jouer',
  },
  {
    id: 'son',
    label: "Le son de l'amour",
    path: '/son',
  },
];

// Anciennes URL de la V1 → nouvelles routes
export const LEGACY_REDIRECTS = [
  { from: '/collection', to: '/propager' },
  { from: '/product/:productId', to: '/propager/masks-and-hearts' },
  { from: '/about', to: '/a-propos' },
  { from: '/journey', to: '/chemin' },
];
