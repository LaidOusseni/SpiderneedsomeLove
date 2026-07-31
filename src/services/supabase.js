/**
 * src/services/supabase.js
 *
 * Initialisation unique du client Supabase.
 * Les clés sont lues depuis les variables d'environnement Vite (.env).
 *
 * ⚠️  Ne jamais écrire les clés directement ici.
 *     Remplir le fichier .env à la racine du projet :
 *     VITE_SUPABASE_URL=https://xxxx.supabase.co
 *     VITE_SUPABASE_ANON_KEY=eyJ...
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '[Supabase] Variables d\'environnement manquantes. ' +
    'Remplissez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY dans le fichier .env'
  );
}

export const supabase = createClient(
  supabaseUrl ?? '',
  supabaseAnonKey ?? ''
);
