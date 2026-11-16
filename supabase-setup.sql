-- ═══════════════════════════════════════════════════════════════
-- Love&Faith — Script SQL Supabase (V1, conservé pour l'historique)
-- ⚠️ Ne plus exécuter tel quel : la politique « preorders_select_public »
--    exposait les données personnelles et est supprimée par
--    supabase/migrations/20261029120000_community_vote.sql (voir docs/SUPABASE.md).
-- Ce fichier seul ne crée pas le backend actuel de vote, de classement ni d'intentions de précommande.
-- Pour le projet actuel, appliquer les migrations listées dans docs/SUPABASE.md dans l'ordre.
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────
-- TABLE : preorders
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS preorders (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  first_name  TEXT NOT NULL,
  last_name   TEXT NOT NULL,
  instagram   TEXT,
  email       TEXT,
  product     TEXT NOT NULL,         -- 'short' | 'long'
  size        TEXT NOT NULL,         -- 'XS' | 'S' | ... | '3XL'
  quantity    INTEGER DEFAULT 1,
  status      TEXT DEFAULT 'pending',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Activer Row Level Security
ALTER TABLE preorders ENABLE ROW LEVEL SECURITY;

-- Politique : tout le monde peut insérer (formulaire public)
CREATE POLICY "preorders_insert_public"
  ON preorders FOR INSERT
  WITH CHECK (true);

-- Politique : lecture publique (pour le compteur communautaire)
CREATE POLICY "preorders_select_public"
  ON preorders FOR SELECT
  USING (true);


-- ─────────────────────────────────────────
-- TABLE : newsletter
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS newsletter (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email      TEXT NOT NULL UNIQUE,   -- UNIQUE évite les doublons
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Activer Row Level Security
ALTER TABLE newsletter ENABLE ROW LEVEL SECURITY;

-- Politique : tout le monde peut s'inscrire
CREATE POLICY "newsletter_insert_public"
  ON newsletter FOR INSERT
  WITH CHECK (true);


-- ─────────────────────────────────────────
-- VÉRIFICATION
-- Exécuter après création pour vérifier :
-- ─────────────────────────────────────────
-- SELECT COUNT(*) FROM preorders;
-- SELECT COUNT(*) FROM newsletter;
