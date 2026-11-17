import { useId } from 'react';
import Modal from '../Modal/Modal';
import { PrivacySections } from '../../sections/Privacy/Privacy';
import { PRIVACY } from '../../constants/privacy';
import styles from './PrivacyModal.module.css';

/**
 * Politique de confidentialité en popup, au-dessus d'un formulaire : le formulaire reste ouvert et rempli.
 * Fermeture : croix, « J'ai compris », Échap ou clic à l'extérieur.
 */
const PrivacyModal = ({ isOpen, onClose }) => {
  const id = useId();
  return (
    <Modal isOpen={isOpen} onClose={onClose} labelledBy={`${id}-title`} className={styles.panel}>
      <div className={styles.inner}>
        <header className={styles.head}>
          <p className={styles.kicker}>Love&amp;Faith</p>
          <h2 id={`${id}-title`} className={styles.title}>Politique de confidentialité</h2>
          <p className={styles.updated}>Dernière mise à jour : {PRIVACY.updatedAt}</p>
        </header>
        <div className={styles.body}>
          <PrivacySections />
        </div>
        <div className={styles.footer}>
          <button type="button" className={styles.ok} onClick={onClose}>J'ai compris</button>
        </div>
      </div>
    </Modal>
  );
};

export default PrivacyModal;
