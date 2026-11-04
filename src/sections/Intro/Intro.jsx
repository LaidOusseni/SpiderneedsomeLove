import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import styles from './Intro.module.css';
import { BRAND_ASSETS, INTRO_LINES } from '../../constants/site';
import { hasWebGL, prefersReducedMotion } from '../../three/webgl';

const LogoCanvas = lazy(() => import('./LogoCanvas'));

/**
 * Introduction immersive.
 * Phases : phrase → logo → bouton. AUCUNE navigation automatique :
 * seul le bouton « Cliquez ici » permet d'entrer (le fond et le logo ne sont pas cliquables).
 */
const T_LOGO = 2600; // la phrase a le temps d'être lue
const T_CTA = 1500;  // après l'apparition du logo
const T_LEAVE = 950; // durée de la transition de sortie

const Intro = ({ onEnter }) => {
  const [reducedMotion] = useState(prefersReducedMotion);
  const [phase, setPhase] = useState(reducedMotion ? 'cta' : 'phrase');
  const [logoFailed, setLogoFailed] = useState(() => !hasWebGL());
  const [logoReady, setLogoReady] = useState(false);
  const leaving = useRef(false);
  const buttonRef = useRef(null);

  useEffect(() => {
    if (reducedMotion) return undefined;
    const t = setTimeout(() => setPhase('logo'), T_LOGO);
    return () => clearTimeout(t);
  }, [reducedMotion]);

  // Le bouton apparaît après le logo (ou après un délai si le logo tarde / échoue)
  useEffect(() => {
    if (phase !== 'logo') return undefined;
    const t = setTimeout(() => setPhase('cta'), logoReady || logoFailed ? T_CTA : T_CTA + 1200);
    return () => clearTimeout(t);
  }, [phase, logoReady, logoFailed]);

  useEffect(() => {
    if (phase === 'cta') buttonRef.current?.focus({ preventScroll: true });
  }, [phase]);

  const handleEnter = useCallback(() => {
    if (leaving.current) return;
    leaving.current = true;
    setPhase('leaving');
    setTimeout(onEnter, reducedMotion ? 150 : T_LEAVE);
  }, [onEnter, reducedMotion]);

  const showLogo = phase !== 'phrase';

  return (
    <section className={`${styles.intro} ${phase === 'leaving' ? styles.leaving : ''}`} aria-label="Introduction Love&Faith">
      <video
        className={styles.video}
        autoPlay={!reducedMotion}
        muted
        loop
        playsInline
        preload="auto"
        poster={BRAND_ASSETS.introPoster}
        aria-hidden="true"
      >
        <source src={BRAND_ASSETS.introVideo} type="video/mp4" />
      </video>
      <div className={styles.vignette} aria-hidden="true" />

      <div className={styles.content}>
        <h1 className={`${styles.phrase} ${showLogo ? styles.phraseUp : ''}`}>
          {INTRO_LINES.map((line, i) => (
            <span key={line} className={styles.line} style={{ animationDelay: `${0.35 + i * 0.85}s` }}>
              {line}
            </span>
          ))}
        </h1>

        <div className={`${styles.logo} ${showLogo ? styles.logoVisible : ''}`} aria-hidden="true">
          <div className={styles.logoHalo} />
          {showLogo && !logoFailed && (
            <Suspense fallback={null}>
              <LogoCanvas
                reducedMotion={reducedMotion}
                onReady={() => setLogoReady(true)}
                onError={() => setLogoFailed(true)}
              />
            </Suspense>
          )}
          {logoFailed && <img src={BRAND_ASSETS.logo2d} alt="" className={styles.logo2d} />}
        </div>

        <div className={styles.ctaWrap}>
          <button
            ref={buttonRef}
            type="button"
            className={`${styles.cta} ${phase === 'cta' || phase === 'leaving' ? styles.ctaVisible : ''}`}
            onClick={handleEnter}
            disabled={phase !== 'cta'}
            aria-hidden={phase !== 'cta' && phase !== 'leaving'}
            tabIndex={phase === 'cta' ? 0 : -1}
          >
            <span className={styles.ctaLabel}>Cliquez ici</span>
            <span className={styles.ctaHint}>Entrer dans l'univers Love&amp;Faith</span>
          </button>
        </div>
      </div>

      <div className={styles.transition} aria-hidden="true" />
    </section>
  );
};

export default Intro;
