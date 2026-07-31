import { useEffect } from 'react';
import styles from './Modal.module.css';

/**
 * Generic modal wrapper — renders children in a fixed overlay
 * @param {boolean} isOpen
 * @param {function} onClose - called when clicking the backdrop
 */
const Modal = ({ isOpen, onClose, children }) => {
  // Prevent body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose} role="dialog" aria-modal="true">
      <div className={styles.content} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
};

export default Modal;
