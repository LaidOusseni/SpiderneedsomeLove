import { useEffect, useState } from 'react';
import styles from './MockupView.module.css';

/**
 * Vue 2D d'une création : le vêtement seul, détouré (WebP transparent, scripts/cutout-mockups.mjs), qui flotte
 * doucement sur le fond Love&Faith. Clic sur le vêtement ou boutons « Devant / Dos » pour le retourner.
 * Les couvertures comics (Masks & Hearts) gardent leur cadre : ce ne sont pas des vêtements à détourer.
 */
const MockupView = ({ creation }) => {
  const [side, setSide] = useState('front');
  useEffect(() => setSide('front'), [creation.slug]);

  const label = side === 'front' ? 'Devant' : 'Dos';
  const flip = () => setSide((s) => (s === 'front' ? 'back' : 'front'));
  const framed = Boolean(creation.mockupsAreCovers);

  return (
    <div className={styles.view}>
      <button
        type="button"
        className={`${styles.card} ${framed ? styles.framed : ''}`}
        onClick={flip}
        aria-label={`${creation.name} — ${label.toLowerCase()} (cliquer pour voir ${side === 'front' ? 'le dos' : 'le devant'})`}
      >
        {/* flottement : la carte bouge, l'image change ; le halo au sol suit le rythme */}
        <span className={styles.float}>
          <img
            key={`${creation.slug}-${side}`}
            src={creation.mockups[side]}
            alt={`${creation.name} — ${label.toLowerCase()}`}
            className={styles.img}
            decoding="async"
          />
        </span>
        {!framed && <span className={styles.shadow} aria-hidden="true" />}
      </button>
      <div className={styles.sides} role="group" aria-label="Face du vêtement">
        {['front', 'back'].map((s) => (
          <button
            key={s}
            type="button"
            className={`${styles.side} ${side === s ? styles.sideActive : ''}`}
            aria-pressed={side === s}
            onClick={() => setSide(s)}
          >
            {s === 'front' ? 'Devant' : 'Dos'}
          </button>
        ))}
      </div>
    </div>
  );
};

export default MockupView;
