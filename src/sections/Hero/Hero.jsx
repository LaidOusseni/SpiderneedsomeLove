import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './Hero.module.css';
import PreorderPopup from '../../components/PreorderPopup/PreorderPopup';

/**
 * Section 1 — Hero
 * Phases: 'intro' → 'fading' → 'logo'
 * - intro : texte centré affiché 3 secondes
 * - fading: fondu du texte (800ms)
 * - logo  : logo 3D animé + bouton "Découvrir notre pouvoir"
 *
 * Logo 3D : rendu via <model-viewer> (CDN, pas de Three.js explicite)
 * Bouton  : navigue vers /collection
 */
const Hero = () => {
  const navigate = useNavigate();
  const [phase, setPhase] = useState('intro');
  const [showPopup, setShowPopup] = useState(false);
  const modelContainerRef = useRef(null);
  // Anti-double-trigger : on ignore tout appel après le premier
  const hasShownPopup = useRef(false);

  // Ouvre le popup (appelé par clic/tap/touche sur l'intro)
  const goToCollection = useCallback(() => {
    if (hasShownPopup.current) return;
    hasShownPopup.current = true;
    setShowPopup(true);
  }, []);

  // Navigation réelle après fermeture du popup
  const handlePopupClose = useCallback(() => {
    setShowPopup(false);
    navigate('/collection', { state: { fromIntro: true } });
  }, [navigate]);

  // Phase sequence: intro → fading → logo
  useEffect(() => {
    const t1 = setTimeout(() => setPhase('fading'), 3000);
    const t2 = setTimeout(() => setPhase('logo'), 3800);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  // Clavier : Enter ou Space n'importe quand après la phase logo
  useEffect(() => {
    const handleKey = (e) => {
      if (phase !== 'logo') return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        goToCollection();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [phase, goToCollection]);

  // Mount <model-viewer> imperatively (React 18 custom element compatibility)
  useEffect(() => {
    const container = modelContainerRef.current;
    if (!container) return;

    const mv = document.createElement('model-viewer');
    mv.setAttribute('src', '/Intro/Logo 3D.glb');
    mv.setAttribute('auto-rotate', '');
    mv.setAttribute('rotation-per-second', '28deg'); // rotation légèrement plus vive
    mv.setAttribute('camera-controls', '');
    mv.setAttribute('disable-zoom', '');
    mv.setAttribute('interaction-prompt', 'none');
    mv.style.width = '290px';
    mv.style.height = '290px';
    mv.style.background = 'transparent';
    mv.style.setProperty('--progress-bar-color', 'transparent');
    mv.style.setProperty('--progress-mask', 'transparent');
    container.appendChild(mv);

    return () => {
      container.innerHTML = '';
    };
  }, []);

  return (
    <>
      {/* Toute la section est cliquable/tappable quand phase === 'logo' */}
      <section
        className={`${styles.hero} ${phase === 'logo' ? styles.heroClickable : ''}`}
        id="hero"
        onClick={phase === 'logo' ? goToCollection : undefined}
        role={phase === 'logo' ? 'button' : undefined}
        tabIndex={phase === 'logo' ? 0 : undefined}
        aria-label={phase === 'logo' ? "Accéder au site Love & Faith" : undefined}
      >
        {/* Background video */}
        <video
          className={styles.video}
          autoPlay
          muted
          loop
          playsInline
          aria-hidden="true"
        >
          <source src="/Intro/Fond intro.mp4" type="video/mp4" />
        </video>

        <div className={styles.overlay}>
          {/* Phase: texte d'intro */}
          <div
            className={`${styles.introText} ${phase === 'fading' ? styles.fadeOut : ''} ${phase === 'logo' ? styles.hidden : ''}`}
          >
            <p>Un grand amour</p>
            <p>vient avec de grandes responsabilités</p>
          </div>

          {/* Phase: logo 3D + bouton */}
          <div className={`${styles.logoContent} ${phase === 'logo' ? styles.fadeIn : ''}`}>
            {/* Container pour model-viewer monté via useEffect */}
            <div ref={modelContainerRef} className={styles.modelContainer} />

            <div
              className={styles.discoverBtn}
              aria-hidden="true"
            >
              Découvrir notre pouvoir
            </div>
          </div>
        </div>
      </section>

      {/* Popup précommandes — s'affiche après l'intro, avant le site */}
      <PreorderPopup isOpen={showPopup} onClose={handlePopupClose} />
    </>
  );
};

export default Hero;
