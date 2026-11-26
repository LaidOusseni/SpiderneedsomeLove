/**
 * Mesure d'audience Love&Faith — anonyme, sans cookie, sans service tiers.
 *
 * Conçue pour l'exemption de consentement de la CNIL (mesure d'audience strictement nécessaire) :
 *   - finalité unique : statistiques agrégées du site (pages, jeu, musique) consultées par l'administrateur ;
 *   - identifiant de visiteur ALÉATOIRE (aucun lien avec une identité), renouvelé tous les 13 mois ;
 *   - aucune adresse IP, aucun nom, aucun e-mail, aucune empreinte de l'appareil (pas de fingerprinting) ;
 *   - événements conservés 25 mois (purge côté Supabase) ;
 *   - refus possible à tout moment (politique de confidentialité), et respect de « Do Not Track » / GPC.
 * Écriture uniquement via la fonction Supabase public.track_events (validation et limites côté serveur).
 *
 * Événements : voir supabase/migrations/20261125120000_music_game_admin.sql (liste autorisée).
 */
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '../constants/supabaseConfig';

const VISITOR_KEY = 'lf-analytics-visitor';
const SESSION_KEY = 'lf-analytics-session';
const OPT_OUT_KEY = 'lf-analytics-optout';
const VISITOR_TTL_MS = 395 * 24 * 3600 * 1000; // 13 mois
const SESSION_GAP_MS = 30 * 60 * 1000; // nouvelle visite après 30 min d'inactivité
const FLUSH_MS = 1000; // envoi groupé rapide : ne pas dépendre uniquement de l'envoi en quittant la page
const MAX_BATCH = 25;
const CRAWLER_UA = /bot|crawler|spider|slurp|lighthouse|headlesschrome\/.*lighthouse/i;

const uuid = () => (crypto.randomUUID ? crypto.randomUUID()
  : '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) => (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)));

function readJson(storage, key) {
  try { return JSON.parse(storage.getItem(key) ?? 'null'); } catch { return null; }
}
function writeJson(storage, key, value) {
  try { storage.setItem(key, JSON.stringify(value)); } catch { /* stockage indisponible */ }
}

export function isAnalyticsOptedOut() {
  try { return localStorage.getItem(OPT_OUT_KEY) === '1'; } catch { return false; }
}

/** Refus / acceptation de la mesure d'audience (politique de confidentialité). Le refus efface l'identifiant. */
export function setAnalyticsOptOut(optOut) {
  try {
    if (optOut) {
      localStorage.setItem(OPT_OUT_KEY, '1');
      localStorage.removeItem(VISITOR_KEY);
      localStorage.removeItem(SESSION_KEY);
      queue.length = 0;
    } else {
      localStorage.removeItem(OPT_OUT_KEY);
    }
  } catch { /* stockage indisponible */ }
}

function trackingAllowed() {
  if (typeof window === 'undefined' || !SUPABASE_URL) return false;
  if (isAnalyticsOptedOut()) return false;
  const nav = window.navigator;
  if (nav.doNotTrack === '1' || window.doNotTrack === '1' || nav.globalPrivacyControl === true) return false;
  if (CRAWLER_UA.test(nav.userAgent || '') || nav.webdriver && !window.__LF_ALLOW_AUTOMATED_ANALYTICS__) return false;
  return true;
}

function ids() {
  const now = Date.now();
  let visitor = readJson(localStorage, VISITOR_KEY);
  if (!visitor?.id || now - (visitor.created ?? 0) > VISITOR_TTL_MS) {
    visitor = { id: uuid(), created: now };
    writeJson(localStorage, VISITOR_KEY, visitor);
  }
  let session = readJson(localStorage, SESSION_KEY);
  if (!session?.id || now - (session.last ?? 0) > SESSION_GAP_MS) session = { id: uuid(), last: now };
  session.last = now;
  writeJson(localStorage, SESSION_KEY, session);
  return { visitor_id: visitor.id, session_id: session.id };
}

/** Type d'appareil déduit de l'écran (pas d'empreinte) : téléphone, tablette ou ordinateur. */
export function deviceType() {
  if (typeof window === 'undefined') return 'desktop';
  const coarse = window.matchMedia?.('(pointer: coarse)').matches;
  const w = Math.min(window.screen?.width || window.innerWidth, window.screen?.height || window.innerHeight);
  if (coarse && w < 600) return 'mobile';
  if (coarse) return 'tablet';
  return 'desktop';
}

/** Nom court d'une page pour les statistiques (jamais de paramètre d'URL). */
export function pageKey(pathname) {
  const path = (pathname || '/').replace(/\/+$/, '') || '/';
  const creation = path.match(/^\/propager\/([a-z0-9-]+)$/);
  if (creation) return `creation:${creation[1]}`;
  const map = {
    '/': 'propager', '/propager': 'propager', '/a-propos': 'a-propos', '/chemin': 'chemin', '/jouer': 'jouer',
    '/son': 'son', '/confidentialite': 'confidentialite', '/mentions-legales': 'mentions-legales',
  };
  return map[path] ?? null;
}

const queue = [];
let timer = null;

function send(batch, { keepalive = false } = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/rpc/track_events`, {
    method: 'POST',
    keepalive,
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_events: batch }),
  }).catch(() => { /* la mesure d'audience ne doit jamais gêner la navigation */ });
}

export function flushAnalytics({ keepalive = false } = {}) {
  clearTimeout(timer);
  timer = null;
  while (queue.length) send(queue.splice(0, MAX_BATCH), { keepalive });
}

/**
 * Enregistre un événement autorisé.
 * @param {string} type  ex. 'page_view', 'music_start', 'game_open'
 * @param {{ page?: string, track?: string, value?: number, mode?: string }} [data]
 */
export function track(type, data = {}) {
  if (!trackingAllowed()) return;
  if (typeof window !== 'undefined' && window.location.pathname.startsWith('/admin')) return; // jamais l'espace privé
  const event = { type, device: deviceType(), ...ids() };
  if (data.page) event.page = data.page;
  if (data.track) event.track = data.track;
  if (typeof data.value === 'number' && Number.isFinite(data.value)) event.value = Math.max(0, Math.round(data.value * 100) / 100);
  if (data.mode) event.mode = String(data.mode).replace(/[^A-Za-z0-9 _.-]/g, '').slice(0, 40) || undefined;
  queue.push(event);
  if (queue.length >= MAX_BATCH) flushAnalytics();
  else if (!timer) timer = setTimeout(flushAnalytics, FLUSH_MS);
}

if (typeof window !== 'undefined') {
  // En quittant la page (ou en passant à une autre application sur téléphone), l'envoi survit à la fermeture
  window.addEventListener('pagehide', () => flushAnalytics({ keepalive: true }));
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flushAnalytics({ keepalive: true }));
}
