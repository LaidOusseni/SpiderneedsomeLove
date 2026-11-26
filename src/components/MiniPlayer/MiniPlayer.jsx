import { createPortal } from 'react-dom';
import { Link, useLocation } from 'react-router-dom';
import styles from './MiniPlayer.module.css';
import { useMusicPlayer } from '../../context/MusicPlayerContext';

/** Lecture en cours hors de « Le son de l'amour » : pause / reprise, retour au tourne-disque, arrêt. */
const MiniPlayer = () => {
  const { pathname } = useLocation();
  const p = useMusicPlayer();
  if (pathname === '/son' || pathname.startsWith('/admin') || p.status === 'idle' || !p.current) return null;
  const playing = p.status === 'playing' || p.status === 'loading';
  // Rendu directement dans <body> : le lecteur reste en bas de l'écran, quel que soit le défilement
  return createPortal(
    <div className={styles.mini} role="region" aria-label="Lecteur musical">
      <Link to="/son" className={styles.info} aria-label={`Ouvrir Le son de l'amour — ${p.current.artist}, ${p.current.title}`}>
        <span className={`${styles.disc} ${playing ? styles.spin : ''}`} aria-hidden="true" />
        <span className={styles.text}>
          <span className={styles.title}>{p.current.title}</span>
          <span className={styles.artist}>{p.current.artist}</span>
        </span>
      </Link>
      <button type="button" className={styles.btn} onClick={p.toggle} aria-label={playing ? 'Pause' : 'Lecture'}>
        <svg viewBox="0 0 24 24" aria-hidden="true">{playing ? <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" /> : <path d="M8 5.5v13l11-6.5z" />}</svg>
      </button>
      <button type="button" className={`${styles.btn} ${styles.close}`} onClick={p.stop} aria-label="Arrêter la musique">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17" /></svg>
      </button>
    </div>,
    document.body,
  );
};

export default MiniPlayer;
