import { useId } from 'react';

/**
 * Le Cœur Love&Faith — illustration originale du footer (SVG dessiné à la main, aucune banque d'images).
 * Gravure / comics : encrage irrégulier (léger décalage d'impression), hachures et contre-hachures dans l'ombre,
 * trame de points, reflet, flamme et rayons (la foi), banderole « Amour · Foi » (l'amour).
 * Le dessin dépasse volontairement du cercle rouge qui le porte (voir SiteFooter.module.css).
 */
const HEART =
  'M200 356 C 124 300 44 236 44 154 C 44 98 86 60 136 60 C 168 60 190 78 200 102 C 210 78 232 60 264 60 C 314 60 356 98 356 154 C 356 236 276 300 200 356 Z';

const FLAME =
  'M200 104 C 178 92 170 70 182 50 C 186 64 192 68 196 66 C 190 48 196 26 214 12 C 210 30 220 42 226 52 C 232 44 232 36 230 28 C 248 46 246 76 226 96 C 218 102 208 106 200 104 Z';

const INK = '#140a0b';
const RED = '#c90025';
const RED_DARK = '#6e0012';
const PAPER = '#f4ece0';

export default function HeartEmblem({ className = '', title = 'Le cœur Love&Faith' }) {
  const id = useId().replace(/:/g, '');
  const ref = (name) => `${name}-${id}`;
  const url = (name) => `url(#${ref(name)})`;

  // Rayons de gravure autour du cœur
  const rays = Array.from({ length: 36 }, (_, i) => {
    const a = (i / 36) * Math.PI * 2;
    const r0 = i % 2 ? 176 : 168;
    const r1 = i % 2 ? 196 : 214;
    return {
      x1: 200 + Math.cos(a) * r0, y1: 196 + Math.sin(a) * r0,
      x2: 200 + Math.cos(a) * r1, y2: 196 + Math.sin(a) * r1,
      w: i % 2 ? 1.6 : 3,
    };
  });

  return (
    <svg viewBox="0 -8 400 420" className={className} role="img" aria-labelledby={ref('t')}>
      <title id={ref('t')}>{title}</title>
      <defs>
        {/* Encre légèrement baveuse, comme une impression textile ou une gravure */}
        <filter id={ref('ink')} x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="7" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="3.2" />
        </filter>
        <filter id={ref('grain')}>
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3" />
          <feColorMatrix values="0 0 0 0 0.08  0 0 0 0 0.04  0 0 0 0 0.04  0 0 0 -2.2 1.25" />
          <feComposite in2="SourceGraphic" operator="in" />
        </filter>
        <clipPath id={ref('clip')}><path d={HEART} /></clipPath>
        <pattern id={ref('hatch')} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(-38)">
          <line x1="0" y1="0" x2="0" y2="6" stroke={INK} strokeWidth="1.6" />
        </pattern>
        <pattern id={ref('cross')} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(42)">
          <line x1="0" y1="0" x2="0" y2="6" stroke={INK} strokeWidth="1.5" />
        </pattern>
        <pattern id={ref('dots')} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(18)">
          <circle cx="4" cy="4" r="1.7" fill={RED_DARK} />
        </pattern>
        <radialGradient id={ref('dotFade')} cx="0.32" cy="0.3" r="0.5">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.55" stopColor="#fff" stopOpacity="0.9" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <mask id={ref('dotMask')}><rect x="0" y="0" width="400" height="400" fill={url('dotFade')} /></mask>
        {/* Ombre propre : le cœur moins sa copie décalée vers la lumière (haut-gauche) */}
        <mask id={ref('shade')}>
          <path d={HEART} fill="#fff" />
          <path d={HEART} fill="#000" transform="translate(-30 -26)" />
        </mask>
        <mask id={ref('deep')}>
          <path d={HEART} fill="#fff" />
          <path d={HEART} fill="#000" transform="translate(-14 -12)" />
        </mask>
        <path id={ref('ribbonText')} d="M92 236 Q 200 268 308 236" />
      </defs>

      <g filter={url('ink')}>
        {/* Rayons */}
        <g stroke={INK} strokeLinecap="round" opacity="0.85">
          {rays.map((r, i) => (
            <line key={i} x1={r.x1} y1={r.y1} x2={r.x2} y2={r.y2} strokeWidth={r.w} />
          ))}
        </g>

        {/* Flamme (la foi) */}
        <path d={FLAME} fill={PAPER} stroke={INK} strokeWidth="5" strokeLinejoin="round" />
        <path d="M206 96 C 196 86 198 70 208 58 C 208 70 214 76 220 80 C 222 88 216 96 206 96 Z" fill={RED} />
        <path d="M188 72 C 192 78 196 82 200 84" stroke={INK} strokeWidth="2" fill="none" strokeLinecap="round" />

        {/* Décalage d'impression : contour rouge sombre sous l'encre */}
        <path d={HEART} fill="none" stroke={RED_DARK} strokeWidth="9" transform="translate(5 5)" />

        {/* Corps du cœur */}
        <path d={HEART} fill={RED} />
        <g clipPath={url('clip')}>
          <rect x="0" y="0" width="400" height="400" fill={url('dots')} mask={url('dotMask')} opacity="0.55" />
          <rect x="0" y="0" width="400" height="400" fill={url('hatch')} mask={url('shade')} />
          <rect x="0" y="0" width="400" height="400" fill={url('cross')} mask={url('deep')} />
          {/* Couture centrale, comme une pièce de vêtement */}
          <path d="M200 112 C 196 180 204 250 200 344" stroke={PAPER} strokeWidth="2.4" strokeDasharray="7 7"
            fill="none" opacity="0.8" />
        </g>
        <path d={HEART} fill="none" stroke={INK} strokeWidth="7" strokeLinejoin="round" />

        {/* Reflets */}
        <path d="M84 132 C 88 104 110 84 138 82" stroke={PAPER} strokeWidth="10" strokeLinecap="round" fill="none" />
        <path d="M80 160 L 80 166" stroke={PAPER} strokeWidth="9" strokeLinecap="round" />
        <path d="M262 84 C 280 82 296 88 306 98" stroke={PAPER} strokeWidth="5" strokeLinecap="round" fill="none" opacity="0.85" />

        {/* Banderole (l'amour) */}
        <g>
          <path d="M40 222 L 78 214 L 70 236 L 80 258 L 40 252 L 52 238 Z" fill={RED_DARK} stroke={INK} strokeWidth="4" strokeLinejoin="round" />
          <path d="M360 222 L 322 214 L 330 236 L 320 258 L 360 252 L 348 238 Z" fill={RED_DARK} stroke={INK} strokeWidth="4" strokeLinejoin="round" />
          <path d="M72 212 Q 200 246 328 212 L 328 248 Q 200 284 72 248 Z" fill={PAPER} stroke={INK} strokeWidth="4.5" strokeLinejoin="round" />
          <path d="M84 222 Q 200 254 316 222" stroke={INK} strokeWidth="1.2" fill="none" opacity="0.5" />
          <text fontFamily="'Playfair Display', Georgia, serif" fontStyle="italic" fontWeight="900" fontSize="21"
            fill={INK} letterSpacing="2" textAnchor="middle">
            <textPath href={`#${ref('ribbonText')}`} startOffset="50%">Amour · Foi</textPath>
          </text>
        </g>

        {/* Éclats comics */}
        <g stroke={INK} strokeWidth="3.5" strokeLinecap="round">
          <path d="M28 96 L 12 84" /><path d="M24 116 L 6 116" /><path d="M36 78 L 28 60" />
          <path d="M372 96 L 388 84" /><path d="M376 116 L 394 116" /><path d="M364 78 L 372 60" />
        </g>
      </g>

      {/* Grain d'impression */}
      <rect x="0" y="-8" width="400" height="420" filter={url('grain')} opacity="0.35" clipPath={url('clip')} />
    </svg>
  );
}
