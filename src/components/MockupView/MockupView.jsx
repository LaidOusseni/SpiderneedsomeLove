import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './MockupView.module.css';
import { useModalLayer } from '../Modal/Modal';

const SIDES = [
  { key: 'front', label: 'Devant' },
  { key: 'back', label: 'Dos' },
];
const POSTER = [{ key: 'poster', label: 'Devant + dos' }];

/** Affiche le mockup source prévu pour chaque face, sans recadrage ni déformation. */
function Face({ creation, side, priority }) {
  return (
    <img
      src={creation.mockups[side]}
      alt={`${creation.name} — ${side === 'poster' ? 'mockup complet, devant et dos' : side === 'front' ? 'devant' : 'dos'}`}
      className={styles.original}
      decoding="async"
      loading="eager"
      fetchPriority={priority ? 'high' : undefined}
    />
  );
}

/**
 * Visionneuse plein écran : image entière (proportions d'origine) sur fond noir, croix toujours visible.
 * Fermeture : croix, Échap ou clic / toucher à côté de l'image. Défilement de la page bloqué.
 */
function Lightbox({ creation, side, label, onClose }) {
  const panelRef = useRef(null);
  useModalLayer(true, panelRef, onClose);
  return createPortal(
    <div
      ref={panelRef}
      className={styles.lightbox}
      role="dialog"
      aria-modal="true"
      aria-label={`${creation.name} — ${label}`}
      tabIndex={-1}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <button type="button" className={styles.lightboxClose} onClick={onClose} aria-label="Fermer l'agrandissement">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
      <img
        src={creation.mockups[side]}
        alt={`${creation.name} — ${label.toLowerCase()}`}
        className={styles.lightboxImg}
        decoding="async"
      />
    </div>,
    document.body,
  );
}

const getAspectRatio = (creation, side) => {
  const aspectRatio = creation.mockupAspectRatio;
  if (typeof aspectRatio === 'number') return aspectRatio;
  return aspectRatio?.[side] ?? 0.75;
};

/**
 * Vue 2D (affichée par défaut) : les faces côte à côte ou le poster complet.
 * Sur ordinateur, les mockups remplissent la hauteur de la scène ; sur mobile, ils suivent la largeur
 * (côte à côte, ou l'un sous l'autre sur les écrans trop étroits) — jamais de défilement horizontal.
 * Toucher / clic : agrandissement.
 */
const MockupView = ({ creation }) => {
  const [zoom, setZoom] = useState(null);
  const sides = creation.mockups.poster ? POSTER : SIDES;

  return (
    <div className={styles.view}>
      <div className={styles.track}>
        {sides.map((s, i) => (
          <figure key={s.key} className={`${styles.slide} ${sides.length === 1 ? styles.slideSingle : ''}`} style={{ '--aspect': getAspectRatio(creation, s.key) }}>
            <button
              type="button"
              className={styles.faceBtn}
              onClick={() => setZoom(s.key)}
              aria-label={`Agrandir — ${creation.name}, ${s.label.toLowerCase()}`}
            >
              <span className={styles.face} style={{ '--d': `${i * 0.12}s`, '--aspect': getAspectRatio(creation, s.key) }}>
                <Face creation={creation} side={s.key} priority={i === 0} />
              </span>
            </button>
            <figcaption className={styles.caption}>{s.label}</figcaption>
          </figure>
        ))}
      </div>

      {zoom && (
        <Lightbox
          creation={creation}
          side={zoom}
          label={sides.find((s) => s.key === zoom)?.label ?? ''}
          onClose={() => setZoom(null)}
        />
      )}
    </div>
  );
};

export default MockupView;
