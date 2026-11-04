import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { fetchDropOverview } from '../services/voteService';

/**
 * Résultats partagés par toutes les pages (cohérence des compteurs) :
 *   status : 'loading' | 'ready' | 'unavailable' (migration non appliquée / Supabase absent) | 'error'
 * Actualisation : au montage, après chaque vote accepté, puis toutes les 45 s si l'onglet est visible.
 */
const REFRESH_MS = 45000;

const VoteResultsContext = createContext(null);

export function VoteResultsProvider({ children }) {
  const [state, setState] = useState({ status: 'loading', drop: null, bySlug: {} });
  const inFlight = useRef(null);

  const refresh = useCallback(async () => {
    if (inFlight.current) return inFlight.current;
    inFlight.current = (async () => {
      try {
        const { drop, creations } = await fetchDropOverview();
        const bySlug = Object.fromEntries(creations.map((c) => [c.slug, c]));
        setState({ status: 'ready', drop, bySlug, updatedAt: Date.now() });
      } catch (err) {
        // On garde les derniers chiffres connus en cas d'erreur réseau passagère
        setState((prev) =>
          prev.status === 'ready' && err.code === 'network'
            ? { ...prev, stale: true }
            : { status: err.code === 'unavailable' ? 'unavailable' : 'error', drop: null, bySlug: {} },
        );
      } finally {
        inFlight.current = null;
      }
    })();
    return inFlight.current;
  }, []);

  useEffect(() => {
    refresh();
    const tick = () => document.visibilityState === 'visible' && refresh();
    const id = setInterval(tick, REFRESH_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [refresh]);

  /** Mise à jour immédiate d'un compteur renvoyé par cast_vote, puis resynchronisation. */
  const applyVoteResult = useCallback((slug, votes) => {
    if (typeof votes === 'number') {
      setState((prev) =>
        prev.bySlug[slug] ? { ...prev, bySlug: { ...prev.bySlug, [slug]: { ...prev.bySlug[slug], votes } } } : prev,
      );
    }
    refresh();
  }, [refresh]);

  const value = useMemo(() => ({ ...state, refresh, applyVoteResult }), [state, refresh, applyVoteResult]);
  return <VoteResultsContext.Provider value={value}>{children}</VoteResultsContext.Provider>;
}

export function useVoteResults() {
  const ctx = useContext(VoteResultsContext);
  if (!ctx) throw new Error('useVoteResults doit être utilisé dans VoteResultsProvider');
  return ctx;
}
