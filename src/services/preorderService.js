import { supabase } from './supabase';
import { normalizeInstagram, validateInstagram } from '../utils/instagram';

const normalize = (value) => (typeof value === 'string' ? value.trim() : '');

const ERROR_MESSAGES = {
  closed: 'Les précommandes de ce drop sont fermées.',
  consent_required: 'Ton accord est nécessaire pour enregistrer ta demande.',
  invalid_email: 'Merci de renseigner une adresse e-mail valide.',
  invalid_input: 'Vérifie ton prénom, ta taille et les quantités indiquées.',
  rate_limited: 'Trop de tentatives en peu de temps. Merci de réessayer plus tard.',
  robot_detected: 'La demande n’a pas pu être enregistrée.',
};

export async function fetchPreorderCount(slug = 'batman-drop-01') {
  if (!supabase) return { count: null, source: 'unavailable' };

  const { data, error } = await supabase.rpc('count_preorder_registrations', { p_drop_slug: slug });

  if (error) throw error;
  return { count: Number(data) || 0, source: 'supabase' };
}

export async function submitPreorder(payload) {
  const firstName = normalize(payload.firstName);
  const lastName = normalize(payload.lastName);
  const instagram = normalize(payload.instagram);
  const email = normalize(payload.email).toLowerCase();
  const sizes = Array.isArray(payload.sizes) ? payload.sizes : [];

  if (!firstName || firstName.length > 60 || !lastName || lastName.length > 60 || !email || !sizes.length) {
    return { ok: false, code: 'invalid_input', message: ERROR_MESSAGES.invalid_input };
  }
  if (instagram && !validateInstagram(instagram).ok) {
    return { ok: false, code: 'invalid_input', message: 'Indique un nom d’utilisateur Instagram valide.' };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, code: 'invalid_email', message: ERROR_MESSAGES.invalid_email };
  }
  if (!payload.consent) {
    return { ok: false, code: 'consent_required', message: ERROR_MESSAGES.consent_required };
  }
  if (!supabase) {
    return { ok: false, code: 'unavailable', message: 'Le service est momentanément indisponible. Merci de réessayer plus tard.' };
  }

  try {
    const { data, error } = await supabase.rpc('register_preorder_with_identity', {
      p_drop_slug: payload.creationSlug || 'batman-drop-01',
      p_first_name: firstName,
      p_last_name: lastName,
      p_email: email,
      p_instagram: normalizeInstagram(instagram) || null,
      p_sizes: sizes,
      p_consent: true,
      p_website: normalize(payload.website),
    });

    if (error) {
      return { ok: false, code: 'server', message: 'Impossible d’enregistrer ton intérêt pour le moment. Merci de réessayer plus tard.' };
    }

    if (!data?.ok) {
      const code = data?.code || 'server';
      return {
        ok: false,
        code,
        message: ERROR_MESSAGES[code] || 'Impossible d’enregistrer ton intérêt pour le moment. Merci de réessayer plus tard.',
      };
    }

    return { ok: true, code: data.code, count: Number(data.people) || 0 };
  } catch {
    return { ok: false, code: 'network', message: 'Connexion impossible. Vérifie ton réseau puis réessaie.' };
  }
}
