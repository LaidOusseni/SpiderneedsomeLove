import { useNavigate } from 'react-router-dom';
import styles from './Collection.module.css';
import ComicHeader from '../../components/ComicHeader/ComicHeader';
import ComicCover from '../../components/ComicCover/ComicCover';
import { NAV_LINKS } from '../../constants/navigation';
import { PRODUCTS } from '../../constants/products';

/**
 * Page Collection — affiche le bandeau + deux couvertures comics
 * Au clic sur une couverture : naviguer vers /product/:id (page dédiée)
 * Le ComicViewer n'est plus inline ici — il est sur sa propre page
 */
const Collection = () => {
  const navigate = useNavigate();

  const handleNavClick = (path) => navigate(path);

  const handleSelectProduct = (product) => {
    navigate(`/product/${product.id}`);
  };

  return (
    <section className={styles.collection} id="collection">
      <ComicHeader links={NAV_LINKS} onLinkClick={handleNavClick} />

      <div className={styles.covers}>
        {PRODUCTS.map((product) => (
          <ComicCover
            key={product.id}
            product={product}
            isSelected={false}
            onClick={() => handleSelectProduct(product)}
          />
        ))}
      </div>
    </section>
  );
};

export default Collection;
