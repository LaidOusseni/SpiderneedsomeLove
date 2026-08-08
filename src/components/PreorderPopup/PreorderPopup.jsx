import Modal from '../Modal/Modal';
import styles from './PreorderPopup.module.css';

/**
 * PreorderPopup — Modal informatif sur les précommandes
 * Apparaît après que l'utilisateur quitte l'intro.
 * onClose : ferme le popup et permet la navigation normale.
 */
const PreorderPopup = ({ isOpen, onClose }) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className={styles.card}>
        {/* Titre visuel */}
        <h2 className={styles.title}>Précommandes</h2>

        {/* Message informatif */}
        <p className={styles.message}>
          Les précommandes sont terminées,<br />
          merci beaucoup pour votre intérêt.<br />
          Une 2<sup>e</sup> précommande aura lieu prochainement.<br />
          Merci.
        </p>

        {/* CTA */}
        <button
          id="preorder-popup-cta"
          className={styles.ctaBtn}
          onClick={onClose}
          aria-label="Fermer la popup et accéder au site Love & Faith"
        >
          Accéder quand même
        </button>
      </div>
    </Modal>
  );
};

export default PreorderPopup;
