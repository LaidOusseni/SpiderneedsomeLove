import { useEffect, useRef, useState } from 'react';
import styles from './MockupView.module.css';
import Modal from '../Modal/Modal';

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

const getAspectRatio = (creation, side) => {
  const aspectRatio = creation.mockupAspectRatio;
  if (typeof aspectRatio === 'number') return aspectRatio;
  return aspectRatio?.[side] ?? 0.75;
};

/**
 * Vue 2D (affichée par défaut) : les faces côte à côte ou le poster complet.
 * Quand la place manque (mobile, colonne étroite), les faces deviennent un carrousel.
 * Clic : agrandissement.
 */
const MockupView = ({ creation }) => {
  const [zoom, setZoom] = useState(null);
  const [active, setActive] = useState(0);
  const trackRef = useRef(null);
  const sides = creation.mockups.poster ? POSTER : SIDES;

  useEffect(() => {
    setActive(0);
    trackRef.current?.scrollTo({ left: 0 });
  }, [creation.slug]);

  // Carrousel : face visible (pour les points)
  const onScroll = () => {
    const el = trackRef.current;
    if (!el) return;
    const i = Math.round(el.scrollLeft / Math.max(1, el.scrollWidth - el.clientWidth));
    setActive(Number.isFinite(i) ? Math.min(sides.length - 1, Math.max(0, i)) : 0);
  };

  const goTo = (i) => {
    const el = trackRef.current;
    if (!el) return;
    el.children[i]?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    setActive(i);
  };

  return (
    <div className={styles.view}>
      <div className={styles.track} ref={trackRef} onScroll={onScroll}>
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

      {sides.length > 1 && (
        <div className={styles.dots} role="group" aria-label="Face du vêtement">
          {sides.map((s, i) => (
            <button key={s.key} type="button" className={`${styles.dot} ${active === i ? styles.dotActive : ''}`}
              aria-pressed={active === i} onClick={() => goTo(i)}>
              {s.label}
            </button>
          ))}
        </div>
      )}

      <Modal isOpen={Boolean(zoom)} onClose={() => setZoom(null)}>
        {zoom && (
          <div className={styles.zoom} style={{ '--aspect': getAspectRatio(creation, zoom) }}>
            <span className={styles.face} style={{ '--aspect': getAspectRatio(creation, zoom) }}>
              <Face creation={creation} side={zoom} priority />
            </span>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default MockupView;
