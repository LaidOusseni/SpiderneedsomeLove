/**
 * src/services/supabase.js
 *
 * Initialisation unique du client Supabase.
 * Les clés sont lues depuis les variables d'environnement Vite (.env).
 *
 * ⚠️  Ne jamais écrire les clés directement ici.
 *     Seule la clé PUBLIQUE (anon) est autorisée côté navigateur.
 *     VITE_SUPABASE_URL=https://xxxx.supabase.co
 *     VITE_SUPABASE_ANON_KEY=eyJ...
 */

import { createClient } from '@supabase/supabase-js';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '../constants/supabaseConfig';

// Projet fixé dans src/constants/supabaseConfig.js (les variables VITE_SUPABASE_* ne sont plus lues :
// sur Vercel elles pointaient vers un ancien projet supprimé, ce qui bloquait votes, classement et précommandes).
const supabaseUrl = SUPABASE_URL;
const supabaseAnonKey = SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '[Supabase] Variables d\'environnement manquantes. ' +
    'Remplissez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY dans le fichier .env'
  );
}

// null si non configuré : les services gèrent ce cas (le site reste utilisable, sans vote)
export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;
