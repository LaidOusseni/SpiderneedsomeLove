import { useCallback, useState } from 'react';
import { hasWebGL } from '../three/webgl';

/**
 * Mode d'affichage « 3d » / « 2d », partagé par la sélection et les fiches création (mémorisé pour ce visiteur :
 * confort uniquement — tout fonctionne sans). Sans WebGL, la 2D est imposée.
 */
const VIEW_KEY = 'lf-view-mode';

function initialViewMode() {
  if (!hasWebGL()) return '2d';
  try {
    return localStorage.getItem(VIEW_KEY) === '2d' ? '2d' : '3d';
  } catch {
    return '3d';
  }
}

export function useViewMode() {
  const [mode, setMode] = useState(initialViewMode);
  const change = useCallback((next) => {
    setMode(next);
    try { localStorage.setItem(VIEW_KEY, next); } catch { /* navigation privée */ }
  }, []);
  return [mode, change];
}
