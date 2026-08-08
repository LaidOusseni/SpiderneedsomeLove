import styles from './PreorderNotice.module.css';

/**
 * PreorderNotice
 *
 * Popup informatif affiché une seule fois à l'arrivée depuis l'intro.
 * Informe que les précommandes sont fermées.
 *
 * Props :
 *   onClose {function} — ferme le popup
 */
const PreorderNotice = ({ onClose }) => {
  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Information précommandes">
      <div className={styles.card}>
        {/* Titre style comics */}
        <p className={styles.title}>Informations</p>

        {/* Message */}
        <p className={styles.message}>
          Les précommandes sont terminées,<br />
          merci beaucoup pour votre intérêt.<br /><br />
          Une 2e précommande aura lieu prochainement.<br />
          Merci&nbsp;❤️
        </p>

        {/* Bouton CTA */}
        <button
          className={styles.btn}
          onClick={onClose}
          autoFocus
        >
          Accéder quand même
        </button>
      </div>
    </div>
  );
};

export default PreorderNotice;
