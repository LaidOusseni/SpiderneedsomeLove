import { useNavigate } from 'react-router-dom';
import styles from './ComicHeader.module.css';

/**
 * Bandeau bleu avec 3 liens de navigation (PAS une navbar fixe)
 * Appartient à chaque section qui l'affiche
 * Utilise useNavigate pour changer de page (React Router)
 */
const ComicHeader = ({ links, onLinkClick }) => {
  const navigate = useNavigate();

  const handleClick = (link) => {
    if (onLinkClick) {
      // Permet au parent de surcharger le comportement si nécessaire
      onLinkClick(link.path);
    } else {
      navigate(link.path);
    }
  };

  return (
    <div className={styles.header}>
      {links.map((link) => (
        <button
          key={link.id}
          className={styles.link}
          onClick={() => handleClick(link)}
        >
          {link.label}
        </button>
      ))}
    </div>
  );
};

export default ComicHeader;
