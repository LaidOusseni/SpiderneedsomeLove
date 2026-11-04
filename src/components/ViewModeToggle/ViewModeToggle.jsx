import styles from './ViewModeToggle.module.css';

/**
 * Sélecteur « Vue 3D / Vue 2D ». Changement instantané, sans rechargement.
 * Si la 3D n'est pas disponible sur l'appareil, le bouton 3D est désactivé (la 2D reste disponible).
 */
const ViewModeToggle = ({ mode, onChange, can3D = true }) => (
  <div className={styles.toggle} role="group" aria-label="Mode d'affichage">
    <button
      type="button"
      className={`${styles.btn} ${mode === '3d' ? styles.active : ''}`}
      aria-pressed={mode === '3d'}
      onClick={() => onChange('3d')}
      disabled={!can3D}
      title={can3D ? 'Figurine 3D manipulable' : "La 3D n'est pas disponible sur cet appareil"}
    >
      <span className={styles.icon} aria-hidden="true">◈</span> Vue 3D
    </button>
    <button
      type="button"
      className={`${styles.btn} ${mode === '2d' ? styles.active : ''}`}
      aria-pressed={mode === '2d'}
      onClick={() => onChange('2d')}
      title="Mockups devant / dos"
    >
      <span className={styles.icon} aria-hidden="true">▣</span> Vue 2D
    </button>
  </div>
);

export default ViewModeToggle;
