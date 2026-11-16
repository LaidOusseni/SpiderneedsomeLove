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
import AsciiLogoBackground from './components/AsciiLogoBackground/AsciiLogoBackground';
import { LEGACY_REDIRECTS } from './constants/navigation';
import styles from './App.module.css';

const CreationDetail = lazy(() => import('./sections/CreationDetail/CreationDetail'));
const LegalNotice = lazy(() => import('./sections/LegalNotice/LegalNotice'));
const Unsubscribe = lazy(() => import('./sections/Unsubscribe/Unsubscribe'));

const ENTERED_KEY = 'lf-entered';
// Recettes automatiques uniquement : passer l'intro (le visiteur, lui, la voit à chaque lancement du site)
const SKIP_INTRO_KEY = 'lf-skip-intro';
const DIRECT_PATHS = ['/confidentialite', '/mentions-legales', '/newsletter/desinscription'];

// Robots d'indexation et d'aperçu de liens : ils ne cliquent pas sur « Cliquez ici ». L'intro (vidéo plein écran) est
// donc passée pour eux afin qu'ils lisent le même contenu que le visiteur voit juste après l'intro.
const CRAWLER_UA = /bot|crawler|spider|slurp|googlebot|bingbot|yandex|baiduspider|duckduckbot|applebot|facebookexternalhit|facebot|twitterbot|linkedinbot|whatsapp|telegrambot|discordbot|pinterest|google-inspectiontool|chrome-lighthouse/i;
const isCrawler = () => typeof navigator !== 'undefined' && CRAWLER_UA.test(navigator.userAgent || '');

function readEntered() {
  try {
    return sessionStorage.getItem(SKIP_INTRO_KEY) === '1';
  } catch {
    return false;
  }
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
  // L'intro (et son son de démarrage) s'affiche à chaque lancement ou rechargement du site, quelle que soit l'URL
  // d'arrivée ; la navigation interne ne la rejoue pas. On n'entre dans le site que par le bouton « Cliquer ici ».
  const [entered, setEntered] = useState(() => isCrawler() || readEntered());

  const handleEnter = useCallback(() => {
    try { sessionStorage.setItem(ENTERED_KEY, '1'); } catch { /* navigation privée */ }
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
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <VoteResultsProvider>
        <Site />
      </VoteResultsProvider>
    </BrowserRouter>
  );
}

export default App;
