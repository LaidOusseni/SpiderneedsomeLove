export const ABOUT_SECTIONS = [
  {
    id: 'why-lf',
    question: 'Pourquoi Love&Faith ?',
    answer:
      "Love&Faith est une marque de vêtements construite autour d'un univers : celui de l'amour et de la foi.\n\nNous croyons que l'amour que l'on se porte à soi-même, que l'on partage avec les autres et que l'on reçoit est l'une des plus grandes sources de paix et de bonheur.\n\nLa foi, quant à elle, ne représente pas seulement une religion mais une manière d'accueillir la vie avec confiance, d'accepter les épreuves comme les joies, et de croire qu'elles participent toutes à notre construction.\n\nLove&Faith est un style de vie. Une manière de rechercher la paix de l'esprit, la paix du cœur et de toujours essayer d'être meilleur envers les autres.\n\nCe projet est né de deux frères qui ont compris que, malgré les blessures que la vie peut laisser, l'amour et la foi étaient les seules choses capables de les relever.\n\nAujourd'hui, nous espérons simplement que cet univers pourra apporter un peu de cette paix à ceux qui le découvriront.",
  },
  {
    id: 'why-clothing',
    question: 'Pourquoi le vêtement ?',
    answer:
      "Parce qu'un vêtement se porte, se voit et se partage. Il accompagne une personne dans sa journée, dans ses rencontres, dans sa manière de se présenter au monde.\n\nChaque pièce Love&Faith porte une idée, une histoire, une façon de regarder la vie. Le vêtement est le support ; le message est ce qui compte.\n\nLe podcast Love&Share et la communauté prolongent ce message au-delà de ce que l'on porte.\n\nLe véritable objectif reste le même : partager une vision de la vie basée sur l'amour, la bienveillance, la foi et le partage.",
  },
  {
    id: 'why-prices',
    question: 'Pourquoi le prix peut varier ?',
    answer:
      "Je souhaite proposer le prix le plus juste possible. Si cela ne dépendait que de moi, j'offrirais ces t-shirts gratuitement.\n\nMalheureusement il faut rémunérer le fournisseur.\n\nPlus nous sommes nombreux, plus le coût de fabrication diminue, donc plus le prix final baisse.\n\nJe ne cherche pas aujourd'hui à faire de Love&Faith un business. Je veux avant tout que cela reste un plaisir.\n\nEt ce plaisir réside actuellement dans le fait de voir des personnes porter ces vêtements, ce pourquoi je cherche à ce qu'ils soient le plus accessibles possible.",
  },
];

// Titre principal de la page About
export const ABOUT_PAGE_TITLE = "À propos de l'amour";

// Valeurs mises en avant en tête de page (et dans le footer)
export const ABOUT_VALUES = ['Amour', 'Foi', 'Bienveillance', 'Solidarité', 'Partage'];

// Présentation détaillée des valeurs (section #valeurs)
export const ABOUT_VALUE_DETAILS = [
  { name: 'Amour', text: "Donner sans compter, agir avec le cœur, sans attendre de retour. C'est notre manière de vivre avec les autres." },
  { name: 'Foi', text: "Avancer malgré les incertitudes. Faire ce qui dépend de nous, et confier le reste à Celui en qui nous croyons." },
  { name: 'Bienveillance', text: 'Regarder les autres avec douceur et respect, même quand le monde ne le fait pas.' },
  { name: 'Solidarité', text: 'Personne ne se relève seul. Une communauté avance quand chacun tend la main.' },
  { name: 'Partage', text: "Ce qui nous a fait du bien mérite d'être transmis : une parole, un message, un vêtement." },
];

// Nouvelle étape : de la pièce unique à une maison de vêtements (ambition, aucun produit commercialisé)
export const ABOUT_NEXT_STEP = {
  kicker: 'La prochaine étape',
  title: 'Devenir une véritable maison de vêtements.',
  paragraphs: [
    "Love&Faith est née sur un T-shirt. Elle ne s'arrêtera pas là.",
    "Notre ambition est d'aller au-delà du T-shirt et de construire un univers vestimentaire complet : des vêtements, des accessoires, des collections et des capsules pensés comme les chapitres d'une même histoire.",
    "Sacs, bonnets, vestes, accessoires : chaque nouvelle pièce sera une autre manière de porter et de propager l'amour, au quotidien, partout où l'on va.",
    "Ces pièces n'existent pas encore. Elles sont notre prochaine étape, et nous les construirons avec vous, comme nous choisissons ensemble chaque drop.",
  ],
  quote: "Les vêtements ne sont qu'un support. Ce que nous partageons, ce sont des valeurs.",
  // `today` = déjà proposé ; les autres sont des ambitions (« À venir »)
  pieces: [
    { id: 'tee', label: 'T-shirts', today: true },
    { id: 'jacket', label: 'Vestes' },
    { id: 'bag', label: 'Sacs' },
    { id: 'beanie', label: 'Bonnets' },
    { id: 'accessories', label: 'Accessoires' },
    { id: 'capsule', label: 'Collections & capsules' },
  ],
};
