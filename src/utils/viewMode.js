import { useCallback, useEffect, useState } from 'react';
import { hasWebGL } from '../three/webgl';

/**
 * Mode d'affichage « 2d » / « 3d ».
 * La vue 2D (couvertures devant / dos) est TOUJOURS l'expérience initiale : aucun modèle 3D n'est attendu pour
 * découvrir une création. La 3D est chargée à la demande, et préchargée discrètement :
 *   - dès que le visiteur montre son intention (survol, focus ou toucher du bouton « Vue 3D ») ;
 *   - ou quand la page est inactive, uniquement sur une connexion rapide sans économiseur de données.
 */
export function useViewMode(resetKey) {
  const [mode, setMode] = useState('2d');
  // Ouvrir une autre création (resetKey) ramène à la vue 2D
  useEffect(() => { setMode('2d'); }, [resetKey]);
  const change = useCallback((next) => {
    if (next === '3d' && !hasWebGL()) return;
    if (next === '3d') prefetch3D();
    setMode(next);
  }, []);
  return [mode, change];
}

let viewerPromise = null;

/**
 * Charge le module du visualiseur 3D. Son import démarre le téléchargement du modèle (useLoader.preload) :
 * les fichiers sont mis en cache (cache du chargeur + cache HTTP) et ne sont jamais téléchargés deux fois.
 */
export function prefetch3D() {
  if (!viewerPromise && hasWebGL()) {
    viewerPromise = import('../components/GarmentViewer/GarmentViewer').catch((err) => {
      viewerPromise = null; // nouvel essai possible plus tard
      throw err;
    });
  }
  return viewerPromise;
}

function fastConnection() {
  const c = typeof navigator !== 'undefined' ? navigator.connection : null;
  if (!c) return true; // information indisponible (Safari, Firefox) : on suppose une connexion correcte
  if (c.saveData) return false;
  return !['slow-2g', '2g', '3g'].includes(c.effectiveType);
}

/** Préchargement en tâche de fond, après l'affichage de la 2D (une seule fois par visite). */
export function useIdlePrefetch3D(enabled = true) {
  useEffect(() => {
    if (!enabled || viewerPromise || !hasWebGL() || !fastConnection()) return undefined;
    const run = () => prefetch3D()?.catch(() => undefined);
    let id;
    let timer;
    timer = setTimeout(() => {
      if ('requestIdleCallback' in window) id = window.requestIdleCallback(run, { timeout: 4000 });
      else run();
    }, 3500); // laisse d'abord les couvertures 2D et les images se charger
    return () => {
      clearTimeout(timer);
      if (id && 'cancelIdleCallback' in window) window.cancelIdleCallback(id);
    };
  }, [enabled]);
}
