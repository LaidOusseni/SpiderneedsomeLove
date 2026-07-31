import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import styles from './ProductDetails.module.css';
import ComicHeader from '../../components/ComicHeader/ComicHeader';
import ComicViewer from '../../components/ComicViewer/ComicViewer';
import Modal from '../../components/Modal/Modal';
import Popup from '../../components/Popup/Popup';
import { PRODUCTS } from '../../constants/products';
import { NAV_LINKS } from '../../constants/navigation';

/**
 * Page Produit — /product/:productId
 * Affiche ComicViewer pour le produit sélectionné.
 * Gère le popup de confirmation après soumission.
 * Après fermeture du popup → navigue vers /about
 */
const ProductDetails = () => {
  const { productId } = useParams();
  const navigate = useNavigate();
  const [showPopup, setShowPopup] = useState(false);

  // Récupère le produit depuis les constantes
  const product = PRODUCTS.find((p) => p.id === productId) ?? PRODUCTS[0];

  const handleNavClick = (path) => navigate(path);

  const handleSubmitSuccess = () => {
    // Remonte immédiatement en haut
    window.scrollTo({
      top: 0,
      left: 0,
      behavior: 'instant'
    });

    setShowPopup(true);
  };

  const handlePopupAction = () => {
    setShowPopup(false);
    // Légère pause pour laisser le popup se fermer avant de tourner la page
    setTimeout(() => navigate('/about'), 300);
  };

  return (
    <section className={styles.page} id="product">
      <ComicHeader links={NAV_LINKS} onLinkClick={handleNavClick} />

      <ComicViewer
        product={product}
        onSubmitSuccess={handleSubmitSuccess}
      />

      <Modal isOpen={showPopup} onClose={() => setShowPopup(false)}>
        <Popup onClose={handlePopupAction} />
      </Modal>
    </section>
  );
};

export default ProductDetails;
