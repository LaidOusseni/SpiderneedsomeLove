import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './Hero.module.css';

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
  const modelContainerRef = useRef(null);

  // Phase sequence: intro → fading → logo
  useEffect(() => {
    const t1 = setTimeout(() => setPhase('fading'), 3000);
    const t2 = setTimeout(() => setPhase('logo'), 3800);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

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
    <section className={styles.hero} id="hero">
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

          <button
            className={styles.discoverBtn}
            onClick={() => navigate('/collection')}
          >
            Découvrir notre pouvoir
          </button>
        </div>
      </div>
    </section>
  );
};

export default Hero;
