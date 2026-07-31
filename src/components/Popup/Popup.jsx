import styles from './Popup.module.css';

/**
 * Popup — bulle jaune comics après soumission du formulaire
 * Contient uniquement : bulle jaune + texte + logo lèvres (Kiss Love)
 * Le gif Spiderman a été déplacé dans la section Journey
 *
 * onClose : ferme le popup et navigue vers /about
 */
const Popup = ({ onClose }) => {
  return (
    <div className={styles.popupWrapper}>
      {/* Bulle jaune burst */}
      <div className={styles.burst}>
        <img
          src="/Icon/Pop up.png"
          alt=""
          className={styles.burstImg}
          aria-hidden="true"
        />

        {/* Contenu centré dans la bulle */}
        <div className={styles.burstContent}>
          <p className={styles.text}>
            Ta demande a bien été enregistrée.
            Merci de faire partie des premières personnes qui propagent l'amour.
          </p>

          {/* Kiss Love — bouton de fermeture */}
          <button
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Fermer et découvrir l'univers Love & Faith"
          >
            <img
              src="/Intro/Kiss Love.png"
              alt="Continuer"
              className={styles.lipsIcon}
            />
          </button>
          <p className={styles.closeText}>
            Clique sur le bisou pour continuer
          </p>
        </div>
      </div>
    </div>
  );
};

export default Popup;
