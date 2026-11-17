import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import styles from './Modal.module.css';

/**
 * Fenêtre modale accessible : Échap pour fermer, focus conservé dans la fenêtre,
 * retour du focus à l'élément d'origine à la fermeture, défilement de la page bloqué.
 * Les fenêtres peuvent s'empiler (ex. politique de confidentialité au-dessus du formulaire de vote) :
 * seule celle du dessus réagit au clavier, et la page reste bloquée tant qu'une fenêtre est ouverte.
 */
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([tabindex="-1"]), select, textarea, [tabindex]:not([tabindex="-1"])';

const layers = [];

/** Couche modale : pile, blocage du défilement, Échap, piège du focus et restitution du focus. */
export function useModalLayer(isOpen, panelRef, onClose) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return undefined;
    const layer = {};
    layers.push(layer);
    const previous = document.activeElement;
    if (layers.length === 1) document.body.style.overflow = 'hidden';
    const first = panelRef.current?.querySelector(FOCUSABLE);
    (first ?? panelRef.current)?.focus({ preventScroll: true });

    const onKey = (e) => {
      if (layers[layers.length - 1] !== layer) return; // une autre fenêtre est au-dessus
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current?.();
      } else if (e.key === 'Tab' && panelRef.current) {
        const items = [...panelRef.current.querySelectorAll(FOCUSABLE)];
        if (!items.length) return;
        const [a, b] = [items[0], items[items.length - 1]];
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); b.focus(); }
        else if (!e.shiftKey && document.activeElement === b) { e.preventDefault(); a.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      layers.splice(layers.indexOf(layer), 1);
      if (layers.length === 0) document.body.style.overflow = '';
      previous?.focus?.({ preventScroll: true });
    };
  }, [isOpen, panelRef]);
}

const Modal = ({ isOpen, onClose, labelledBy, className, children }) => {
  const panelRef = useRef(null);
  useModalLayer(isOpen, panelRef, onClose);

  if (!isOpen) return null;

  return createPortal(
    <div className={styles.overlay} onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div
        ref={panelRef}
        className={[styles.panel, className].filter(Boolean).join(' ')}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
      >
        <button type="button" className={styles.close} onClick={onClose} aria-label="Fermer">
          ×
        </button>
        {children}
      </div>
    </div>,
    document.body,
  );
}

export default Modal;
