import { POSES } from '../../three/figure/poses';
import styles from './PoseSelector.module.css';

/**
 * Pictogrammes des poses : silhouette de figurine (tête-boîte, bonnet, torse, mains en C) dans la pose.
 * Repère 40 × 52, la figurine regarde le visiteur ; « R » = bras droit du personnage = gauche de l'image.
 */
const HEAD = <><rect x="13" y="7" width="14" height="12" rx="4" /><path d="M12.5 10.5 Q20 1.5 27.5 10.5 Z" /></>;
const BODY = <><rect x="12" y="21" width="16" height="14" rx="4" /><path d="M14 35 h5 v13 h-5 Z M21 35 h5 v13 h-5 Z" /></>;
const HAND = (x, y) => <circle cx={x} cy={y} r="2.4" className={styles.hand} />;
const ARM = (d) => <path d={d} className={styles.limb} />;

const ICONS = {
  neutre: <>{HEAD}{BODY}{ARM('M12 23 L8 34')}{ARM('M28 23 L32 34')}{HAND(7.5, 36)}{HAND(32.5, 36)}</>,
  'bras-croises': <>{HEAD}{BODY}{ARM('M12 23 L10 29 L27 27')}{ARM('M28 23 L30 29 L13 31')}{HAND(27.5, 27)}{HAND(12.5, 31)}</>,
  'main-poche': <>{HEAD}{BODY}{ARM('M12 23 L10 30 L15 35')}{ARM('M28 23 L32 34')}{HAND(15.5, 35.5)}{HAND(32.5, 36)}</>,
  pouce: <>{HEAD}{BODY}{ARM('M12 23 L7 26 L7 17')}{ARM('M28 23 L32 34')}<path d="M5 14.5 v-4" className={styles.limb} />{HAND(7, 16)}{HAND(32.5, 36)}</>,
  regard: <><g transform="rotate(-14 20 13)">{HEAD}</g>{BODY}{ARM('M12 23 L8 34')}{ARM('M28 23 L32 34')}{HAND(7.5, 36)}{HAND(32.5, 36)}<path d="M33 9 l4 -1.5 M33 12 h4.5" className={styles.limb} /></>,
  bonnet: <>{HEAD}{BODY}{ARM('M12 23 L8 34')}{ARM('M28 23 L35 17 L29 9')}{HAND(7.5, 36)}{HAND(28.5, 8.5)}</>,
  assis: <><g transform="translate(0 6)">{HEAD}<rect x="12" y="21" width="16" height="13" rx="4" /><path d="M13 31 h15 v5 h-15 Z M23 31 h5 v14 h-5 Z M14 31 h5 v14 h-5 Z" />{ARM('M12 23 L11 31 L16 33')}{ARM('M28 23 L29 31 L24 33')}</g><rect x="2" y="38" width="12" height="9" rx="1" className={styles.seat} /></>,
};

export default function PoseSelector({ value, onChange, disabled = false, className = '' }) {
  return (
    <div className={`${styles.bar} ${className}`} role="radiogroup" aria-label="Pose de la figurine">
      <span className={styles.title} aria-hidden="true">Poses</span>
      {POSES.map((p, i) => {
        const active = p.id === value;
        return (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={`${p.label} — ${p.hint}`}
            title={p.label}
            disabled={disabled}
            className={`${styles.item} ${active ? styles.active : ''}`}
            onClick={() => onChange(p.id)}
          >
            <span className={styles.index} aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
            <svg viewBox="0 0 40 52" className={styles.icon} aria-hidden="true">{ICONS[p.id]}</svg>
            <span className={styles.label}>{p.label}</span>
          </button>
        );
      })}
    </div>
  );
}
