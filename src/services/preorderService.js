import { supabase } from './supabase';

const STORAGE_KEY = 'lovefaith-preorders-local';

const normalize = (value) => (typeof value === 'string' ? value.trim() : '');

function readLocalPreorders() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalPreorders(items) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // stock local réduit à cause de la navigation privée ou des restrictions du navigateur
  }
}

export async function fetchPreorderCount() {
  if (!supabase) {
    return { count: readLocalPreorders().length, source: 'local' };
  }

  try {
    const { data, error } = await supabase.rpc('count_preorders');
    if (error) {
      const text = error?.message ?? '';
      if (/does not exist|function .*count_preorders/i.test(text)) {
        return { count: readLocalPreorders().length, source: 'local' };
      }
      throw error;
    }

    return { count: Number(data) || 0, source: 'supabase' };
  } catch {
    return { count: readLocalPreorders().length, source: 'local' };
  }
}

export async function submitPreorder(payload) {
  const firstName = normalize(payload.firstName);
  const lastName = normalize(payload.lastName);
  const email = normalize(payload.email);
  const size = normalize(payload.size);
  const quantity = Number(payload.quantity) || 1;
  const deliveryInfo = normalize(payload.deliveryInfo);

  const record = {
    creation_slug: payload.creationSlug || 'batman-drop-01',
    first_name: firstName,
    last_name: lastName,
    email,
    product: 'long',
    size,
    quantity,
    delivery_info: deliveryInfo,
  };

  if (!firstName || !lastName || !email || !size) {
    return { ok: false, code: 'invalid_input', message: 'Merci de remplir les champs obligatoires.' };
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, code: 'invalid_email', message: 'Merci de renseigner une adresse e-mail valide.' };
  }

  if (!supabase) {
    const list = readLocalPreorders();
    list.push({ ...record, source: 'local' });
    writeLocalPreorders(list);
    return {
      ok: true,
      code: 'local_saved',
      message: 'Précommande enregistrée localement. Elle sera synchronisée dès que la table Supabase sera disponible.',
      count: list.length,
    };
  }

  try {
    const { error } = await supabase.from('preorders').insert([record]);
    if (!error) {
      const countResult = await fetchPreorderCount();
      return {
        ok: true,
        code: 'saved',
        message: 'Précommande enregistrée. Aucune commande n\'a été payée pour le moment.',
        count: countResult.count,
      };
    }

    const text = error?.message ?? '';
    if (/does not exist|relation .*preorders/i.test(text)) {
      const list = readLocalPreorders();
      list.push({ ...record, source: 'local' });
      writeLocalPreorders(list);
      return {
        ok: true,
        code: 'local_saved',
        message: 'Précommande enregistrée localement. La table Supabase est absente pour le moment.',
        count: list.length,
      };
    }

    return { ok: false, code: 'server', message: 'Une erreur est survenue lors de l\'enregistrement de la précommande.' };
  } catch (error) {
    const list = readLocalPreorders();
    list.push({ ...record, source: 'local' });
    writeLocalPreorders(list);
    return {
      ok: true,
      code: 'local_saved',
      message: 'Précommande enregistrée localement. Le service de paiement n\'est pas encore activé.',
      count: list.length,
    };
  }
}
