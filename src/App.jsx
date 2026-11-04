import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import NavBar from './components/NavBar/NavBar';
import Intro from './sections/Intro/Intro';
import Propager from './sections/Propager/Propager';
import About from './sections/About/About';
import Journey from './sections/Journey/Journey';
import Privacy from './sections/Privacy/Privacy';
import { VoteResultsProvider } from './context/VoteResultsContext';
import { LEGACY_REDIRECTS } from './constants/navigation';
import styles from './App.module.css';

const CreationDetail = lazy(() => import('./sections/CreationDetail/CreationDetail'));

const ENTERED_KEY = 'lf-entered';

function readEntered() {
  try {
    return sessionStorage.getItem(ENTERED_KEY) === '1';
  } catch {
    return false;
  }
}

/** Remonte en haut de page à chaque changement de route (hors changement de création sélectionnée). */
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

function Site() {
  const location = useLocation();
  const navigate = useNavigate();
  // L'intro s'affiche à la première visite de la session, quelle que soit l'URL d'arrivée,
  // et toujours sur « / ». On n'entre dans le site que par le bouton « Cliquez ici ».
  const [entered, setEntered] = useState(() => readEntered() && location.pathname !== '/');

  const handleEnter = useCallback(() => {
    try { sessionStorage.setItem(ENTERED_KEY, '1'); } catch { /* navigation privée */ }
    if (location.pathname === '/') navigate('/propager', { replace: true });
    setEntered(true);
  }, [location.pathname, navigate]);

  // La politique de confidentialité reste lisible directement (lien du formulaire ouvert dans un nouvel onglet)
  if (!entered && location.pathname !== '/confidentialite') return <Intro onEnter={handleEnter} />;

  return (
    <div className={styles.site}>
      <ScrollToTop />
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
            {LEGACY_REDIRECTS.map((r) => (
              <Route key={r.from} path={r.from} element={<Navigate to={r.to} replace />} />
            ))}
            <Route path="*" element={<Navigate to="/propager" replace />} />
          </Routes>
        </Suspense>
      </main>
      <footer className={styles.footer}>
        <span>© Love&amp;Faith</span>
        <Link to="/confidentialite">Politique de confidentialité</Link>
      </footer>
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
