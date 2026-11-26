import { useId } from 'react';
import styles from './Music.module.css';
import { BRAND_ASSETS } from '../../constants/site';

const CX = 222;
const CY = 214;
const R = 176;
const HEART = 'M0 3.2C-1.6 1.2-5 -0.6-5 -3.4C-5 -5.4-3.5 -6.6-1.9 -6.6C-0.9 -6.6-0.3 -6.1 0 -5.4C0.3 -6.1 0.9 -6.6 1.9 -6.6C3.5 -6.6 5 -5.4 5 -3.4C5 -0.6 1.6 1.2 0 3.2Z';

/**
 * Tourne-disque rétrofuturiste Love&Faith (SVG, sans image lourde).
 * `spinning` : le vinyle (et le logo central) tourne à 33⅓ tours/min, vitesse constante gérée en CSS.
 * `armOn` : le bras se pose sur le disque (lecture) ou revient sur son support (pause).
 */
const Turntable = ({ spinning, armOn, label }) => {
  const uid = useId().replace(/:/g, '');
  const id = (name) => `${uid}-${name}`;
  const ringText = 'LOVE&FAITH ✦ 愛 ✦ '.repeat(5);

  return (
    <svg viewBox="0 0 520 430" className={styles.turntable} role="img" aria-label={label}>
      <defs>
        <linearGradient id={id('plinth')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#e3192f" />
          <stop offset="0.45" stopColor="#b30c1f" />
          <stop offset="1" stopColor="#6d0410" />
        </linearGradient>
        <linearGradient id={id('edge')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ff8a95" stopOpacity="0.55" />
          <stop offset="0.12" stopColor="#ff8a95" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.35" />
        </linearGradient>
        <radialGradient id={id('vinyl')} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0.3" stopColor="#c8102a" />
          <stop offset="0.85" stopColor="#a50b20" />
          <stop offset="1" stopColor="#6e0613" />
        </radialGradient>
        <linearGradient id={id('metal')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f4f4f4" />
          <stop offset="0.5" stopColor="#9a9a9a" />
          <stop offset="1" stopColor="#3b3b3b" />
        </linearGradient>
        <linearGradient id={id('shine')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.32" />
          <stop offset="0.4" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.6" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#fff" stopOpacity="0.12" />
        </linearGradient>
        {/* Motif léopard de cœurs noirs */}
        <pattern id={id('hearts')} width="46" height="40" patternUnits="userSpaceOnUse" patternTransform="rotate(-14)">
          <path d={HEART} transform="translate(10 12) scale(1.35)" fill="#140103" />
          <path d={HEART} transform="translate(32 9) rotate(28) scale(0.95)" fill="#140103" />
          <path d={HEART} transform="translate(22 29) rotate(-22) scale(1.15)" fill="#140103" />
          <path d={HEART} transform="translate(42 31) rotate(12) scale(0.8)" fill="#140103" />
          <path d={HEART} transform="translate(4 33) rotate(40) scale(0.7)" fill="#140103" />
        </pattern>
        <path id={id('ring')} d={`M ${CX} ${CY} m -158 0 a 158 158 0 1 1 316 0 a 158 158 0 1 1 -316 0`} />
        <clipPath id={id('label')}><circle cx={CX} cy={CY} r="56" /></clipPath>
        <filter id={id('glow')} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="10" />
        </filter>
      </defs>

      {/* Socle */}
      <rect x="8" y="10" width="504" height="410" rx="22" fill="#000" opacity="0.5" transform="translate(6 8)" />
      <rect x="8" y="8" width="504" height="410" rx="22" fill={`url(#${id('plinth')})`} />
      <rect x="8" y="8" width="504" height="410" rx="22" fill={`url(#${id('edge')})`} />
      <rect x="9" y="9" width="502" height="408" rx="21" fill="none" stroke="#ffb3bb" strokeOpacity="0.35" />
      {[[30, 30], [490, 30], [30, 396], [490, 396]].map(([x, y]) => (
        <g key={`${x}-${y}`}><circle cx={x} cy={y} r="5" fill={`url(#${id('metal')})`} /><path d={`M${x - 3} ${y}h6`} stroke="#333" strokeWidth="1.2" /></g>
      ))}

      {/* Plateau */}
      <circle cx={CX} cy={CY} r={R + 16} fill="#1a0a0c" />
      <circle cx={CX} cy={CY} r={R + 16} fill="none" stroke={`url(#${id('metal')})`} strokeWidth="3" />
      <circle cx={CX} cy={CY} r={R + 6} fill="#0b0405" />

      {/* Vinyle (tourne avec son étiquette) */}
      <g className={`${styles.vinyl} ${spinning ? styles.spinning : ''}`} style={{ transformOrigin: `${CX}px ${CY}px` }}>
        <circle cx={CX} cy={CY} r={R} fill={`url(#${id('vinyl')})`} />
        <circle cx={CX} cy={CY} r={R - 26} fill={`url(#${id('hearts')})`} opacity="0.92" />
        {Array.from({ length: 16 }, (_, i) => (
          <circle key={i} cx={CX} cy={CY} r={66 + i * 5.4} fill="none" stroke="#000" strokeOpacity={i % 3 === 0 ? 0.32 : 0.16} strokeWidth="0.8" />
        ))}
        <circle cx={CX} cy={CY} r={R - 4} fill="none" stroke="#2a0005" strokeWidth="2" />
        <circle cx={CX} cy={CY} r={R - 22} fill="none" stroke="#fff" strokeOpacity="0.5" strokeWidth="1" />
        <text className={styles.ringText}>
          <textPath href={`#${id('ring')}`} startOffset="0">{ringText}</textPath>
        </text>
        {/* Étiquette centrale : logo Love&Faith */}
        <circle cx={CX} cy={CY} r="60" fill="#120203" stroke="#e3192f" strokeWidth="3" />
        <g clipPath={`url(#${id('label')})`}>
          <circle cx={CX} cy={CY} r="56" fill="#1d0205" />
          <image href={BRAND_ASSETS.titleIntro} x={CX - 52} y={CY - 26} width="104" height="52" preserveAspectRatio="xMidYMid meet" />
        </g>
        <path d={`M ${CX - 4} ${CY - 44} l 4 -8 l 4 8 l -4 3 z`} fill="#fff" opacity="0.8" />
        <path d={`M ${CX - 4} ${CY + 44} l 4 8 l 4 -8 l -4 -3 z`} fill="#fff" opacity="0.8" />
      </g>
      {/* Reflet fixe (le disque tourne dessous) */}
      <circle cx={CX} cy={CY} r={R} fill={`url(#${id('shine')})`} pointerEvents="none" />
      <circle cx={CX} cy={CY} r="6" fill={`url(#${id('metal')})`} />

      {/* Lueur de lecture */}
      <circle cx={CX} cy={CY} r={R + 10} fill="none" stroke="#ff3355" strokeWidth="10" opacity={spinning ? 0.35 : 0}
        filter={`url(#${id('glow')})`} className={styles.glow} />

      {/* Commandes décoratives du socle */}
      <g opacity="0.95">
        <circle cx="44" cy="372" r="16" fill="#2a0508" stroke={`url(#${id('metal')})`} strokeWidth="2.5" />
        <path d="M44 360v10" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
        <rect x="74" y="364" width="54" height="16" rx="3" fill="#160203" stroke="#000" />
        {[0, 1, 2].map((i) => <rect key={i} x={78 + i * 17} y="367" width="13" height="10" rx="2" fill="#3a3a3a" />)}
        <rect x="438" y="350" width="50" height="40" rx="5" fill="#160203" stroke={`url(#${id('metal')})`} />
        <path d="M452 360v20M474 360v20" stroke="#777" strokeWidth="3" strokeLinecap="round" />
        <rect x="449" y={spinning ? 362 : 372} width="6" height="6" rx="1" fill="#ff3355" className={styles.fader} />
        <circle cx="486" cy="404" r="5" fill={spinning ? '#ff3355' : '#4a0b12'} className={styles.led} />
      </g>

      {/* Bras de lecture : pivot en haut à droite, se pose sur les sillons pendant la lecture */}
      <g className={`${styles.arm} ${armOn ? styles.armOn : ''}`} style={{ transformOrigin: '440px 76px' }}>
        <circle cx="440" cy="76" r="30" fill="#140203" stroke={`url(#${id('metal')})`} strokeWidth="3" />
        <circle cx="440" cy="76" r="16" fill={`url(#${id('metal')})`} />
        <rect x="430" y="36" width="20" height="26" rx="5" fill="#1e1e1e" stroke="#555" />
        <path d="M440 76 L440 286 L420 318" fill="none" stroke="#2b2b2b" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M440 76 L440 286 L420 318" fill="none" stroke={`url(#${id('metal')})`} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="405" y="310" width="28" height="22" rx="4" transform="rotate(34 419 321)" fill="#1a1a1a" stroke="#888" />
        <circle cx="410" cy="330" r="2.5" fill="#ff3355" />
      </g>
      {/* Support du bras au repos */}
      <path d="M454 258 v30" stroke={`url(#${id('metal')})`} strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
};

export default Turntable;
