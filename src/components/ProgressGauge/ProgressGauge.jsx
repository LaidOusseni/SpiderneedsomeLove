import { useEffect, useState } from 'react';
import styles from './ProgressGauge.module.css';
import { formatShare, formatVotes } from '../../utils/voteStats';

/**
 * Jauge façon interface de jeu : rouge = part des votes exprimés, reste en gris clair.
 * La valeur numérique reste toujours lisible (et annoncée aux lecteurs d'écran).
 */
const ProgressGauge = ({ share = 0, votes = 0, label, size = 'md', highlight = false, showVotes = true }) => {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    // remplissage progressif à l'affichage et à chaque nouvelle valeur
    const id = requestAnimationFrame(() => setWidth(Math.max(0, Math.min(100, share))));
    return () => cancelAnimationFrame(id);
  }, [share]);

  return (
    <div className={`${styles.gauge} ${styles[size]} ${highlight ? styles.highlight : ''}`}>
      <div
        className={styles.track}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(share)}
        aria-label={label ? `${label} : ${formatShare(share)} des votes exprimés` : undefined}
      >
        <div className={styles.fill} style={{ width: `${width}%` }} />
        <div className={styles.ticks} aria-hidden="true" />
      </div>
      <div className={styles.values}>
        <span className={styles.share}>{formatShare(share)}</span>
        {showVotes && <span className={styles.votes}>{formatVotes(votes)}</span>}
      </div>
    </div>
  );
};

export default ProgressGauge;
