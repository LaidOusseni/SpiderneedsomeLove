import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { flushAnalytics, pageKey, track } from '../../services/analytics';

const MAX_PAGE_SECONDS = 3600;

/**
 * Une vue de page par changement de route (pas pour un simple paramètre ?c=…), puis le temps réellement passé
 * sur la page (onglet visible uniquement), envoyé en quittant la page.
 */
const RouteAnalytics = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    const page = pageKey(pathname);
    if (!page) return undefined;
    track('page_view', { page });

    let visibleMs = 0;
    let since = document.visibilityState === 'visible' ? performance.now() : null;
    let sent = false;
    const pause = () => {
      if (since !== null) visibleMs += performance.now() - since;
      since = null;
    };
    const report = () => {
      pause();
      if (sent) return;
      const seconds = Math.min(MAX_PAGE_SECONDS, visibleMs / 1000);
      if (seconds >= 1) {
        sent = true;
        track('page_time', { page, value: seconds });
      }
    };
    // Onglet masqué ou page quittée : envoi immédiat (l'envoi doit survivre à la fermeture)
    const reportNow = () => { report(); flushAnalytics({ keepalive: true }); };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') { if (since === null) since = performance.now(); }
      else reportNow();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', reportNow);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', reportNow);
      report();
    };
  }, [pathname]);

  return null;
};

export default RouteAnalytics;
