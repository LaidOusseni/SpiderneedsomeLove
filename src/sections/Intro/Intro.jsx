import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import styles from './Intro.module.css';
import { BRAND_ASSETS, INTRO_LINES } from '../../constants/site';
import { hasWebGL, prefersReducedMotion } from '../../three/webgl';
import AsciiLogoBackground from '../../components/AsciiLogoBackground/AsciiLogoBackground';

const LogoCanvas = lazy(() => import('./LogoCanvas'));

/**
 * Introduction immersive.
 * Phases : titre 2D → phrase → fondu → logo 3D → bouton. AUCUNE navigation automatique :
 * seul le bouton « Cliquez ici » permet d'entrer (le fond et le logo ne sont pas cliquables).
 */
const T_TITLE = 3200;
const T_PHRASE = 3100;
const T_LOGO_3D = 1600;
const T_LEAVE = 950;
const INTRO_SOUND = '/sound/intro-startup.mp3';
const SOUND_VOLUME = 0.7;

/**
 * Son de démarrage : joué uniquement pendant l'intro, coupé en fondu quand on entre dans le site.
 * Si le navigateur bloque la lecture automatique avec son, elle démarre au premier geste sur l'intro.
 */
function useIntroSound() {
  const audioRef = useRef(null);
  const stoppedRef = useRef(false);

  useEffect(() => {
    const audio = new Audio(INTRO_SOUND);
    audio.preload = 'auto';
    audio.volume = SOUND_VOLUME;
    audioRef.current = audio;
    const events = ['pointerdown', 'keydown', 'touchstart'];
    const unlock = (event) => {
      events.forEach((e) => window.removeEventListener(e, unlock, true));
      if (event?.target?.closest?.('[data-intro-enter]')) return; // le clic d'entrée ne déclenche pas le son
      if (!stoppedRef.current && audio.paused) audio.play().catch(() => {});
    };
    audio.play().catch(() => events.forEach((e) => window.addEventListener(e, unlock, { capture: true, passive: true })));
    return () => {
      events.forEach((e) => window.removeEventListener(e, unlock, true));
      stoppedRef.current = true;
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    };
  }, []);

  return useCallback((duration) => {
    stoppedRef.current = true;
    const audio = audioRef.current;
    if (!audio || audio.paused) return;
    const start = audio.volume;
    const t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / duration);
      audio.volume = Math.max(0, start * (1 - k));
      if (k < 1) requestAnimationFrame(step);
      else audio.pause();
    };
    requestAnimationFrame(step);
  }, []);
}

const Intro = ({ onEnter }) => {
  const [reducedMotion] = useState(prefersReducedMotion);
  const [phase, setPhase] = useState('title');
  const [logoFailed, setLogoFailed] = useState(() => !hasWebGL());
  const leaving = useRef(false);
  const buttonRef = useRef(null);
  const fadeOutSound = useIntroSound();

  useEffect(() => {
    if (!['title', 'phrase', 'phraseExit', 'logo3d'].includes(phase)) return undefined;
    const duration = phase === 'title'
      ? (reducedMotion ? 500 : T_TITLE)
      : phase === 'phrase'
        ? (reducedMotion ? 1000 : T_PHRASE)
        : phase === 'phraseExit'
          ? (reducedMotion ? 150 : 850)
        : (reducedMotion ? 500 : T_LOGO_3D);
    const nextPhase = phase === 'title'
      ? 'phrase'
      : phase === 'phrase'
        ? 'phraseExit'
        : phase === 'phraseExit'
          ? 'logo3d'
          : 'cta';
    const timer = setTimeout(() => setPhase(nextPhase), duration);
    return () => clearTimeout(timer);
  }, [phase, reducedMotion]);

  useEffect(() => {
    if (phase === 'cta') buttonRef.current?.focus({ preventScroll: true });
  }, [phase]);

  const handleEnter = useCallback(() => {
    if (leaving.current) return;
    leaving.current = true;
    setPhase('leaving');
    fadeOutSound(reducedMotion ? 120 : T_LEAVE - 100);
    setTimeout(onEnter, reducedMotion ? 150 : T_LEAVE);
  }, [onEnter, reducedMotion, fadeOutSound]);

  const showPhrase = phase === 'phrase';
  const showTitle = phase === 'title';
  const showLogo3d = phase === 'logo3d' || phase === 'cta';

  return (
    <section className={`${styles.intro} ${phase === 'leaving' ? styles.leaving : ''}`} aria-label="Introduction Love&Faith">
      <video
        className={`${styles.video} ${showTitle ? styles.videoHidden : ''}`}
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
      <AsciiLogoBackground />
      <div className={styles.vignette} aria-hidden="true" />

      <div className={styles.content}>
        <img
          src={BRAND_ASSETS.titleIntro}
          alt=""
          className={`${styles.titleLogo} ${showTitle ? styles.titleLogoVisible : styles.titleLogoHidden}`}
          aria-hidden="true"
        />

        <h1 className={`${styles.phrase} ${showPhrase ? styles.phraseUp : styles.phraseHidden} ${showPhrase ? styles.phraseVisible : ''}`}>
          {INTRO_LINES.map((line, i) => (
            <span key={line} className={styles.line} style={{ animationDelay: `${0.35 + i * 0.85}s` }}>
              {line}
            </span>
          ))}
        </h1>

        <div
          className={`${styles.logo} ${showLogo3d ? styles.logoVisible : ''}`}
        >
          <div className={styles.logoHalo} />
          {showLogo3d && !logoFailed && (
            <Suspense fallback={null}>
              <LogoCanvas
                reducedMotion={reducedMotion}
                onError={() => setLogoFailed(true)}
              />
            </Suspense>
          )}
          {showLogo3d && logoFailed && <img src={BRAND_ASSETS.logo2d} alt="" className={styles.logo2d} />}
        </div>

        <div className={styles.ctaWrap}>
          <button
            ref={buttonRef}
            data-intro-enter
            type="button"
            className={`${styles.cta} ${phase === 'cta' || phase === 'leaving' ? styles.ctaVisible : ''}`}
            onClick={handleEnter}
            disabled={phase !== 'cta'}
            aria-hidden={phase !== 'cta' && phase !== 'leaving'}
            tabIndex={phase === 'cta' ? 0 : -1}
          >
            <span className={styles.ctaLabel}>Cliquer ici</span>
            <span className={styles.ctaHint}>Entrer dans l'univers Love&amp;Faith</span>
          </button>
        </div>
      </div>

      <div className={styles.transition} aria-hidden="true" />
    </section>
  );
};

export default Intro;
