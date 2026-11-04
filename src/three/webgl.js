let support = null;

/** Détection unique du support WebGL (sinon : aperçu 2D). */
export function hasWebGL() {
  if (support !== null) return support;
  try {
    const canvas = document.createElement('canvas');
    support = Boolean(window.WebGLRenderingContext && (canvas.getContext('webgl2') || canvas.getContext('webgl')));
  } catch {
    support = false;
  }
  return support;
}

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Appareil modeste : pas d'ombres portées, résolution plafonnée. */
export const isLowPowerDevice = () =>
  typeof navigator !== 'undefined' &&
  ((navigator.hardwareConcurrency ?? 8) <= 4 || (navigator.deviceMemory ?? 8) <= 4);
