import styles from './ViewModeToggle.module.css';
import { prefetch3D } from '../../utils/viewMode';

/**
 * Sélecteur « Vue 2D / Vue 3D ». La 2D est affichée par défaut ; la 3D est proposée ensuite.
 * Survoler, focaliser ou toucher le bouton 3D lance le préchargement de la figurine (changement quasi instantané).
 * Si la 3D n'est pas disponible sur l'appareil, le bouton 3D est désactivé.
 */
const ViewModeToggle = ({ mode, onChange, can3D = true }) => {
  const intent = can3D ? () => { prefetch3D()?.catch(() => undefined); } : undefined;
  return (
    <div className={styles.toggle} role="group" aria-label="Mode d'affichage">
      <button
        type="button"
        className={`${styles.btn} ${mode === '2d' ? styles.active : ''}`}
        aria-pressed={mode === '2d'}
        onClick={() => onChange('2d')}
        title="Couvertures devant / dos"
      >
        <span className={styles.icon} aria-hidden="true">▣</span> Vue 2D
      </button>
      <button
        type="button"
        className={`${styles.btn} ${mode === '3d' ? styles.active : ''}`}
        aria-pressed={mode === '3d'}
        onClick={() => onChange('3d')}
        onPointerEnter={intent}
        onFocus={intent}
        onTouchStart={intent}
        disabled={!can3D}
        title={can3D ? 'Figurine 3D manipulable' : "La 3D n'est pas disponible sur cet appareil"}
      >
        <span className={styles.icon} aria-hidden="true">◈</span> Vue 3D
      </button>
    </div>
  );
};

export default ViewModeToggle;
