import { useCallback, useEffect, useRef, useState } from 'react';
import styles from './Game.module.css';
import { BRAND_ASSETS } from '../../constants/site';
import { track } from '../../services/analytics';

/**
 * Jouer avec l'amour — 51 Wheeling (Zaher, 5HC), joué depuis son origine officielle https://www.51games.fr.
 * Le jeu n'est jamais copié ni hébergé ici : classement, 51Boutique, Session Live, comptes, 2FA et anti-bot
 * restent gérés par 51games.fr. L'adresse est celle que produit le widget officiel (embed.js) :
 * embed=1, partner=loveandfaith et host=<domaine du site>.
 */
export const GAME_ORIGIN = 'https://www.51games.fr';
const PARTNER = 'loveandfaith';
const REACH_TIMEOUT_MS = 15000;
const OWN_LOADER_MS = 3500; // ensuite, l'écran de chargement du jeu lui-même prend le relais

export function gameUrl() {
  const host = String(window.location.hostname || '').toLowerCase().replace(/[^a-z0-9.-]/g, '').slice(0, 80);
  const params = new URLSearchParams({ embed: '1', partner: PARTNER });
  if (host) params.set('host', host);
  return `${GAME_ORIGIN}/?${params.toString()}`;
}

const fullscreenElement = () => document.fullscreenElement || document.webkitFullscreenElement || null;

const Game = () => {
  const frameRef = useRef(null);
  const stageRef = useRef(null);
  const [src] = useState(gameUrl);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState('loading'); // loading | loaded | error
  const [immersive, setImmersive] = useState(false); // plein écran natif ou mode immersif (iPhone)
  const [portrait, setPortrait] = useState(false);
  const readyCounted = useRef(false);

  // Chargement : on vérifie que 51games.fr répond (requête sans lecture de contenu), puis l'écran de chargement
  // de 51 Wheeling prend le relais. Le jeu étant lourd, l'iframe peut mettre longtemps à terminer son chargement.
  useEffect(() => {
    setStatus('loading');
    readyCounted.current = false;
    let active = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REACH_TIMEOUT_MS);
    fetch(`${GAME_ORIGIN}/embed.js`, { mode: 'no-cors', cache: 'no-store', signal: controller.signal })
      .then(() => {
        if (!active) return;
        track('game_open', { page: 'jouer' }); // une session de jeu ouverte depuis Love&Faith
        setTimeout(() => active && setStatus((st) => (st === 'loading' ? 'loaded' : st)), OWN_LOADER_MS);
      })
      .catch(() => active && setStatus('error'))
      .finally(() => clearTimeout(timer));
    return () => { active = false; controller.abort(); clearTimeout(timer); };
  }, [attempt]);

  const onLoad = useCallback(() => setStatus((st) => (st === 'error' ? st : 'loaded')), []);

  // Événements transmis par le jeu (postMessage) — acceptés uniquement depuis l'origine officielle et notre iframe
  useEffect(() => {
    const onMessage = (ev) => {
      if (ev.origin !== GAME_ORIGIN || ev.source !== frameRef.current?.contentWindow) return;
      const data = ev.data;
      if (!data || data.source !== '51wheeling') return;
      if (typeof window.on51WheelingEvent === 'function') { try { window.on51WheelingEvent(data); } catch { /* */ } }
      window.dispatchEvent(new CustomEvent('51wheeling:event', { detail: data }));
      const type = data.event ?? data.type; // format reçu : { source: '51wheeling', event: 'ready', partner, version }
      if (type === 'ready' && !readyCounted.current) {
        readyCounted.current = true;
        setStatus('loaded');
        track('game_ready', { page: 'jouer' });
      } else if (type === 'run_end') {
        const score = Number(data.score);
        track('game_run_end', {
          page: 'jouer',
          value: Number.isFinite(score) && score >= 0 ? score : undefined,
          mode: typeof data.mode === 'string' ? data.mode : undefined,
        });
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // Plein écran natif quand il existe, sinon mode immersif (iPhone : pas de plein écran pour un élément)
  const enterFullscreen = useCallback(async () => {
    track('game_fullscreen', { page: 'jouer' });
    const el = stageRef.current;
    const request = el?.requestFullscreen || el?.webkitRequestFullscreen;
    if (request) {
      try {
        await request.call(el, { navigationUI: 'hide' });
        try { await window.screen.orientation?.lock?.('landscape'); } catch { /* verrouillage refusé : simple conseil affiché */ }
        return;
      } catch { /* refusé : mode immersif */ }
    }
    setImmersive(true);
  }, []);

  const exitFullscreen = useCallback(() => {
    if (fullscreenElement()) (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
    setImmersive(false);
  }, []);

  useEffect(() => {
    const onChange = () => setImmersive(Boolean(fullscreenElement()) || false);
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
    };
  }, []);

  useEffect(() => {
    if (!immersive || fullscreenElement()) return undefined;
    document.body.style.overflow = 'hidden';
    // Le contenu principal passe au-dessus de la barre de navigation le temps du mode immersif
    document.documentElement.classList.add('lf-game-immersive', 'lf-site-settled'); // « settled » reste : pas de nouveau fondu
    const onKey = (e) => e.key === 'Escape' && setImmersive(false);
    window.addEventListener('keydown', onKey);
    return () => {
      document.documentElement.classList.remove('lf-game-immersive');
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [immersive]);

  useEffect(() => {
    const mq = window.matchMedia('(orientation: portrait) and (max-width: 900px)');
    const update = () => setPortrait(mq.matches);
    update();
    mq.addEventListener?.('change', update);
    return () => mq.removeEventListener?.('change', update);
  }, []);

  return (
    <section className={styles.page} aria-labelledby="game-title">
      <img src={BRAND_ASSETS.logo2d} alt="" className={styles.sideLogo} aria-hidden="true" />
      <h1 id="game-title" className={styles.srOnly}>Jouer avec l'amour — 51 Wheeling</h1>

      <div ref={stageRef} className={`${styles.stage} ${immersive ? styles.immersive : ''}`}>
        <iframe
          key={attempt}
          ref={frameRef}
          src={src}
          title="51 Wheeling — jeu de wheeling 3D de 5HC"
          className={styles.frame}
          allow="fullscreen; autoplay; gamepad; accelerometer; gyroscope"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          onLoad={onLoad}
        />
        {status === 'loading' && (
          <div className={styles.overlay} role="status">
            <span className={styles.loader} aria-hidden="true" />
            <p>Chargement de 51 Wheeling…</p>
          </div>
        )}
        {status === 'error' && (
          <div className={styles.overlay} role="alert">
            <p className={styles.errorTitle}>51 Wheeling ne répond pas pour le moment.</p>
            <p>Le jeu est peut-être en maintenance. Réessaie dans un instant ou joue directement sur 51games.fr.</p>
            <div className={styles.errorActions}>
              <button type="button" className={styles.btn} onClick={() => setAttempt((a) => a + 1)}>Réessayer</button>
              <a className={styles.btnGhost} href={GAME_ORIGIN} target="_blank" rel="noopener noreferrer"
                onClick={() => track('game_external', { page: 'jouer' })}>Ouvrir 51games.fr</a>
            </div>
          </div>
        )}
        {immersive && (
          <button type="button" className={styles.fsExit} onClick={exitFullscreen} aria-label="Quitter le plein écran">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17" /></svg>
            <span>Quitter</span>
          </button>
        )}
        {immersive && portrait && <p className={styles.rotateHint}>Astuce : tourne ton téléphone pour jouer à l'horizontale.</p>}
      </div>

      {/* Sous le jeu (jamais par-dessus ses propres menus) : plein écran et lien officiel */}
      <div className={styles.under}>
        <button type="button" className={styles.fsBtn} onClick={enterFullscreen} aria-label="Jouer en plein écran">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>
          <span>Plein écran</span>
        </button>
        <a className={styles.direct} href={GAME_ORIGIN} target="_blank" rel="noopener noreferrer"
          onClick={() => track('game_external', { page: 'jouer' })}>
          Jouer directement sur 51Games.fr ↗
        </a>
      </div>

      <section className={styles.about} aria-labelledby="game-about">
        <h2 id="game-about" className={styles.title}>Explication du jeu</h2>
        <p>
          51 Wheeling est un jeu développé par Zaher, membre de 5HC. Une expérience de conduite et de wheeling qui évolue
          régulièrement avec de nouvelles fonctionnalités et de nouveaux événements.
        </p>
        <p>Pour découvrir son travail et les autres projets de l'équipe, rendez-vous sur 5HC.fr.</p>
        <p>Love&amp;Faith possède également son propre événement spécial directement dans le jeu.</p>
      </section>

      <section className={styles.event} aria-labelledby="game-event">
        <p className={styles.eventKicker}>Événement spécial</p>
        <h2 id="game-event" className={styles.eventTitle}>LOVE&amp;FAITH EVENT</h2>
        <p>Un événement spécial Love&amp;Faith est disponible dans 51 Wheeling.</p>
        <p className={styles.eventLead}>Pour le découvrir :</p>
        <ol className={styles.steps}>
          <li>Lance le jeu.</li>
          <li>Accède à la rubrique Session Live.</li>
          <li>Entre le code : <strong className={styles.code}>5HC</strong></li>
          <li>Découvre l'événement Love&amp;Faith et débloque les habits Love&amp;Faith disponibles dans le jeu.</li>
        </ol>
        <a className={styles.btn} href="https://5hc.fr" target="_blank" rel="noopener noreferrer">Découvrir 5HC</a>
        <p className={styles.soon}>Ce n'est que le début. De nombreuses mises à jour et de nouveaux événements arriveront prochainement.</p>
      </section>
    </section>
  );
};

export default Game;
