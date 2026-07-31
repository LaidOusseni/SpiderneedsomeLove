import { useState, useRef } from 'react';
import styles from './ComicViewer.module.css';
import Input from '../Input/Input';
import Button from '../Button/Button';
import { SIZES } from '../../constants/products';
import { PREORDER_TEXT } from '../../constants/preorder';
import { submitPreorder } from '../../services/preorderService';

const INITIAL_FORM = {
  nom: '',
  prenom: '',
  instagram: '',
  email: '',
  taille: '',
  quantite: 1,
};

/**
 * ComicViewer — appears below the comic covers when a product is selected
 * Contains: product images + description (left) and preorder form (right)
 */
const ComicViewer = ({ product, onSubmitSuccess }) => {
  const [formData, setFormData] = useState(INITIAL_FORM);
  const [scrolledToBottom, setScrolledToBottom] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const scrollZoneRef = useRef(null);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleScroll = (e) => {
    const el = e.currentTarget;
    const isBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 10;
    if (isBottom) setScrolledToBottom(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!scrolledToBottom || loading) return;

    // Validation taille obligatoire
    if (!formData.taille) {
      setSubmitError('Veuillez s\'il vous plaît sélectionner une taille.');
      return;
    }

    setSubmitError(null);
    setLoading(true);
    try {
      await submitPreorder({ ...formData, productId: product.id });
      onSubmitSuccess();
    } catch (err) {
      console.error('[ComicViewer] Erreur soumission:', err);
      setSubmitError(
        'Une erreur est survenue. Veuillez réessayer ou nous contacter sur Instagram.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.viewer} id="comic-viewer">
      {/* ── LEFT PANEL ── */}
      <div className={styles.left}>
        <div className={styles.images}>
          <div className={styles.imgWrapper}>
            <img src={product.coverFront} alt={`${product.name} — face avant`} />
          </div>
          <div className={styles.imgWrapper}>
            <img src={product.coverBack} alt={`${product.name} — face arrière`} />
          </div>
        </div>
        <div className={styles.descriptionBox}>
          <p className={styles.descriptionTitle}>{product.name}</p>
          <p className={styles.descriptionText}>{product.description}</p>
        </div>
      </div>

      {/* ── RIGHT PANEL (blue form) ── */}
      <div className={styles.right}>
        <div className={styles.formPanel}>
          {/* Logo */}
          <div className={styles.logoRow}>
            <img src="/Intro/Logo 2D.png" alt="Love & Faith" className={styles.logo} />
          </div>

          <form onSubmit={handleSubmit} className={styles.form}>
            {/* Row: Nom / Prénom / Instagram */}
            <div className={styles.row3}>
              <Input
                label="Nom"
                id="nom"
                name="nom"
                placeholder="Nom"
                value={formData.nom}
                onChange={handleChange}
                required
              />
              <Input
                label="Prénom"
                id="prenom"
                name="prenom"
                placeholder="Prénom"
                value={formData.prenom}
                onChange={handleChange}
                required
              />
              <Input
                label="Instagram"
                id="instagram"
                name="instagram"
                placeholder="@ton_pseudo"
                value={formData.instagram}
                onChange={handleChange}
              />
            </div>

            {/* Email */}
            <Input
              label="Adresse email (facultatif)"
              id="email"
              name="email"
              type="email"
              placeholder="ton@email.com"
              value={formData.email}
              onChange={handleChange}
            />

            {/* Taille */}
            <div className={styles.sizeSection}>
              <p className={styles.sizeLabel}>
                Taille <span className={styles.sizeNote}>(T-shirt oversized : prendre une taille en dessous)</span>
              </p>
              <div className={styles.sizeGrid}>
                {SIZES.map((size) => (
                  <Input
                    key={size}
                    type="radio"
                    id={`size-${size}`}
                    name="taille"
                    label={size}
                    value={size}
                    checked={formData.taille === size}
                    onChange={handleChange}
                  />
                ))}
              </div>
            </div>

            {/* Scrollable preorder text */}
            <div
              className={styles.scrollZone}
              onScroll={handleScroll}
              ref={scrollZoneRef}
              tabIndex={0}
              aria-label="Informations précommande — faites défiler jusqu'en bas pour activer le bouton"
            >
              <p className={styles.scrollText}>{PREORDER_TEXT}</p>
            </div>

            {/* Submit */}
            <div className={styles.submitRow}>
              <Button
                type="submit"
                variant="primary"
                disabled={!scrolledToBottom || loading}
              >
                {loading ? 'Envoi...' : "Propager l'amour"}
              </Button>
              {!scrolledToBottom && (
                <p className={styles.scrollHint}>
                  ↓ Faites défiler jusqu'en bas pour activer le bouton
                </p>
              )}
              {submitError && (
                <p className={styles.submitError} role="alert">
                  {submitError}
                </p>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ComicViewer;
