/**
 * Identifiants Instagram.
 * La normalisation sert UNIQUEMENT à appliquer la règle « un vote par création et par identifiant ».
 * La même règle est appliquée côté base de données (fonction lf_normalize_instagram) : le serveur fait foi.
 */

// Règles Instagram : 1 à 30 caractères parmi lettres, chiffres, point et underscore
const HANDLE_RE = /^[a-z0-9._]{1,30}$/;

export function normalizeInstagram(value) {
  if (typeof value !== 'string') return '';
  let v = value.trim().toLowerCase();
  // URL de profil collée : instagram.com/pseudo/ → pseudo
  v = v.replace(/^(https?:\/\/)?(www\.)?(instagram\.com|instagr\.am)\//, '');
  v = v.split(/[/?#]/)[0];
  v = v.replace(/^@+/, '');
  return v.replace(/\s+/g, '');
}

export function validateInstagram(value) {
  const n = normalizeInstagram(value);
  if (!n) return { ok: false, normalized: n, error: 'Indique ton identifiant Instagram.' };
  if (!HANDLE_RE.test(n)) {
    return {
      ok: false,
      normalized: n,
      error: 'Identifiant Instagram invalide : lettres, chiffres, points et « _ » uniquement (30 caractères max).',
    };
  }
  if (n.startsWith('.') || n.endsWith('.') || n.includes('..')) {
    return { ok: false, normalized: n, error: 'Identifiant Instagram invalide : vérifie la position des points.' };
  }
  return { ok: true, normalized: n, error: null };
}

/** Nettoie un prénom / nom : espaces superflus, longueur bornée. */
export function cleanName(value, max = 60) {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}
