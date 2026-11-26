import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import NavBar from './components/NavBar/NavBar';
import Intro from './sections/Intro/Intro';
import Propager from './sections/Propager/Propager';
import About from './sections/About/About';
import Journey from './sections/Journey/Journey';
import Privacy from './sections/Privacy/Privacy';
import SiteFooter from './components/SiteFooter/SiteFooter';
import { VoteResultsProvider } from './context/VoteResultsContext';
import RouteSeo from './components/RouteSeo/RouteSeo';
import RouteAnalytics from './components/RouteAnalytics/RouteAnalytics';
import MiniPlayer from './components/MiniPlayer/MiniPlayer';
import { MusicPlayerProvider } from './context/MusicPlayerContext';
import AsciiLogoBackground from './components/AsciiLogoBackground/AsciiLogoBackground';
import { LEGACY_REDIRECTS } from './constants/navigation';
import styles from './App.module.css';

const CreationDetail = lazy(() => import('./sections/CreationDetail/CreationDetail'));
const LegalNotice = lazy(() => import('./sections/LegalNotice/LegalNotice'));
const Unsubscribe = lazy(() => import('./sections/Unsubscribe/Unsubscribe'));
const Game = lazy(() => import('./sections/Game/Game'));
const Music = lazy(() => import('./sections/Music/Music'));
const Admin = lazy(() => import('./sections/Admin/Admin'));

// ── Introduction : une seule lecture par visite ──
// • sessionStorage (onglet) : une actualisation ou un changement de page ne la rejoue jamais ;
// • localStorage (dernière activité) : fermer puis rouvrir le navigateur dans la foulée reste la même visite ;
// • au-delà de VISIT_GAP_MS sans activité sur le site, c'est une nouvelle visite : l'intro se rejoue.
// L'URL n'est jamais modifiée : on reste sur la page demandée (la barre d'adresse fait référence).
const INTRO_DONE_KEY = 'lf-intro-done';
const LAST_ACTIVE_KEY = 'lf-last-active';
const VISIT_GAP_MS = 30 * 60 * 1000;
const HEARTBEAT_MS = 60 * 1000;
// Recettes automatiques uniquement : passer l'intro
const SKIP_INTRO_KEY = 'lf-skip-intro';
const DIRECT_PATHS = ['/confidentialite', '/mentions-legales', '/newsletter/desinscription', '/admin'];

// Robots d'indexation et d'aperçu de liens : ils ne cliquent pas sur « Cliquez ici ». L'intro (vidéo plein écran) est
// donc passée pour eux afin qu'ils lisent le même contenu que le visiteur voit juste après l'intro.
const CRAWLER_UA = /bot|crawler|spider|slurp|googlebot|bingbot|yandex|baiduspider|duckduckbot|applebot|facebookexternalhit|facebot|twitterbot|linkedinbot|whatsapp|telegrambot|discordbot|pinterest|google-inspectiontool|chrome-lighthouse/i;
const isCrawler = () => typeof navigator !== 'undefined' && CRAWLER_UA.test(navigator.userAgent || '');

function introAlreadySeen() {
  try {
    if (sessionStorage.getItem(SKIP_INTRO_KEY) === '1' || sessionStorage.getItem(INTRO_DONE_KEY) === '1') return true;
    const last = Number(localStorage.getItem(LAST_ACTIVE_KEY));
    return last > 0 && Date.now() - last < VISIT_GAP_MS;
  } catch {
    return false; // stockage indisponible (navigation privée stricte) : l'intro se joue
  }
}

function markVisitActive() {
  try {
    sessionStorage.setItem(INTRO_DONE_KEY, '1');
    localStorage.setItem(LAST_ACTIVE_KEY, String(Date.now()));
  } catch { /* stockage indisponible */ }
}

/** Tant que le site est ouvert (et visible), la visite reste active ; mise à jour aussi en quittant la page. */
function useVisitHeartbeat(active) {
  useEffect(() => {
    if (!active) return undefined;
    markVisitActive();
    const beat = () => document.visibilityState === 'visible' && markVisitActive();
    const id = setInterval(beat, HEARTBEAT_MS);
    document.addEventListener('visibilitychange', markVisitActive);
    window.addEventListener('pagehide', markVisitActive);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', markVisitActive);
      window.removeEventListener('pagehide', markVisitActive);
    };
  }, [active]);
}

/**
 * Remonte en haut de page à chaque changement de route (hors changement de création sélectionnée).
 * Avec une ancre (#newsletter, #valeurs…), défile jusqu'à la section dès qu'elle est rendue (pages chargées à la demande).
 */
function ScrollToTop() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (!hash) {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      return undefined;
    }

    let cancelled = false;
    let tries = 0;
    let timer;

    const seek = () => {
      if (cancelled) return;
      const id = decodeURIComponent(hash.slice(1));
      const el = document.getElementById(id);
      if (!el) {
        if (tries++ < 30) timer = setTimeout(seek, 80);
        return;
      }

      const stickyOffset = document.querySelector('header')?.offsetHeight ?? 0;
      const targetTop = el.getBoundingClientRect().top + window.scrollY - stickyOffset - 16;
      window.scrollTo({ top: Math.max(0, targetTop), left: 0, behavior: 'smooth' });
    };

    seek();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [pathname, hash]);
  return null;
}

function Site() {
  const location = useLocation();
  const navigate = useNavigate();
  // L'intro (et son son de démarrage) se joue une fois par visite, quelle que soit l'URL d'arrivée ; ensuite,
  // ni la navigation ni une actualisation ne la rejouent. On n'entre dans le site que par le bouton « Cliquer ici ».
  const [entered, setEntered] = useState(() => isCrawler() || introAlreadySeen());
  useVisitHeartbeat(entered);

  const handleEnter = useCallback(() => {
    markVisitActive();
    if (location.pathname === '/') navigate('/propager', { replace: true });
    setEntered(true);
  }, [location.pathname, navigate]);

  // Pages lisibles directement, sans l'intro : confidentialité, mentions légales, désinscription (liens externes / e-mails)
  if (!entered && !DIRECT_PATHS.includes(location.pathname)) return <><RouteSeo /><Intro onEnter={handleEnter} /></>;

  return (
    <div className={styles.site}>
      <AsciiLogoBackground />
      <ScrollToTop />
      <RouteSeo />
      <RouteAnalytics />
      <a href="#contenu" className={styles.skip}>Aller au contenu</a>
      <NavBar />
      <main id="contenu" className={styles.main}>
        <Suspense fallback={<div className={styles.loading} aria-live="polite">Chargement…</div>}>
          <Routes>
            <Route path="/" element={<Navigate to="/propager" replace />} />
            <Route path="/propager" element={<Propager />} />
            <Route path="/propager/:slug" element={<CreationDetail />} />
            <Route path="/a-propos" element={<About />} />
            <Route path="/chemin" element={<Journey />} />
            <Route path="/jouer" element={<Game />} />
            <Route path="/son" element={<Music />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/confidentialite" element={<Privacy />} />
            <Route path="/mentions-legales" element={<LegalNotice />} />
            <Route path="/newsletter/desinscription" element={<Unsubscribe />} />
            {LEGACY_REDIRECTS.map((r) => (
              <Route key={r.from} path={r.from} element={<Navigate to={r.to} replace />} />
            ))}
            <Route path="*" element={<Navigate to="/propager" replace />} />
          </Routes>
        </Suspense>
      </main>
      <SiteFooter />
      <MiniPlayer />
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <VoteResultsProvider>
        <MusicPlayerProvider>
          <Site />
        </MusicPlayerProvider>
      </VoteResultsProvider>
    </BrowserRouter>
  );
}

export default App;
