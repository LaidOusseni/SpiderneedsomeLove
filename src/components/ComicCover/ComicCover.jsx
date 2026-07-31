import styles from './ComicCover.module.css';

/**
 * Comic book cover card component
 * @param {Object} product - product data from constants/products.js
 * @param {boolean} isSelected - highlights the selected card
 * @param {function} onClick
 */
const ComicCover = ({ product, isSelected, onClick }) => {
  return (
    <div
      className={`${styles.cover} ${isSelected ? styles.selected : ''}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label={`Voir ${product.title}`}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
    >
      <div className={styles.imageWrapper}>
        <img
          src={product.coverFront}
          alt={product.title}
          className={styles.image}
        />
      </div>
      <p className={styles.title}>{product.title}</p>
    </div>
  );
};

export default ComicCover;
