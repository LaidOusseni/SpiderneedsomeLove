/**
 * Fichiers sources de chaque création (chemins relatifs à la racine du projet).
 * Correspondances vérifiées visuellement :
 *   - « World Love Front (2).png » montre en réalité le DOS (globe + « Je t'aime » en plusieurs langues).
 *   - L'icône « Gemini_Generated_Image… » (Mr. Freeze et sa boule à neige) correspond à Heart of Ice.
 *   - LVA = « For (45) » (lèvres sur léopard bordeaux, comme ses lèvres rouges) ;
 *     PLVA = « For (43) » (léopard rouge/violet, comme le bisou bleu-lavande de son dos).
 */
export const CREATION_SOURCES = [
  {
    slug: 'heart-of-ice',
    icon: 'Icon/Gemini_Generated_Image_r0wilir0wilir0wi.jfif',
    front: 'Mockups/Heart of ice front.png',
    back: 'Mockups/Heart of ice back.png', // dos uni (aucun motif)
  },
  {
    slug: 'love-in-darkness',
    icon: 'Icon/For (40).png',
    front: 'Mockups/Love in drakness Front.png',
    back: 'Mockups/Love in darkness Back.png',
  },
  {
    slug: 'world-love',
    icon: 'Icon/For (30).png',
    front: 'Mockups/World Love Front (1).png',
    back: 'Mockups/World Love Front (2).png',
  },
  {
    slug: 'fabulous-love-and-faith',
    icon: 'Icon/Casino LoveFaith.jpeg',
    front: 'Mockups/Casino Front.png',
    back: 'Mockups/Casino Back (2).png',
  },
  {
    slug: 'lva',
    icon: 'Icon/For (45).png',
    front: 'Mockups/LVA Front (1).png',
    back: 'Mockups/LVA Back.png',
  },
  {
    slug: 'plva',
    icon: 'Icon/For (43).png', // léopard rouge/violet : écho au bisou bleu-lavande du dos de PLVA
    front: 'Mockups/PLVA Front.png',
    back: 'Mockups/PLVA Back (1).png',
  },
  {
    slug: 'masks-and-hearts',
    icon: 'Icon/For (41).png',
    iconCrop: 0.85, // retire la bande blanche sous l'illustration
    // Galerie : couvertures comics de la V1 (pas de mockups « bruts » disponibles)
    front: 'public/Comics/front-short.png',
    back: 'public/Comics/back-short.png',
    extractPrints: false,
    printFront: { file: 'Icon/For (41).png', crop: [0, 0, 1, 0.851] },
  },
];
