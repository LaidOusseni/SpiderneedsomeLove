import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { MUSIC_TRACKS } from '../../src/constants/music';
import { pageKey } from '../../src/services/analytics';
import { NAV_LINKS } from '../../src/constants/navigation';

describe('Le son de l\'amour — catalogue', () => {
  it('contient les 12 morceaux réels du dossier Music, avec un fichier lisible par les navigateurs', () => {
    expect(MUSIC_TRACKS).toHaveLength(12);
    for (const t of MUSIC_TRACKS) {
      expect(t.src).toMatch(/^\/music\/[a-z0-9-]+\.(mp3|m4a)$/);
      expect(fs.existsSync(`public${t.src}`)).toBe(true);
      expect(t.duration).toBeGreaterThan(60);
      if (t.cover) expect(fs.existsSync(`public${t.cover}`)).toBe(true);
    }
    expect(MUSIC_TRACKS.map((t) => `${t.artist} - ${t.title}`)).toEqual(expect.arrayContaining([
      'Barty - Pour oublier', 'Cooper - La haine #1', 'MWL - Croire en nous', 'MWL - Réalise mes voeux', 'Rakeem - SonBody',
    ]));
  });

  it('est identique à la bibliothèque insérée par la migration Supabase', () => {
    const sql = fs.readFileSync('supabase/migrations/20261125120000_music_game_admin.sql', 'utf8');
    for (const t of MUSIC_TRACKS) expect(sql).toContain(`'${t.id}'`);
  });
});

describe('Mesure d\'audience', () => {
  it('nomme les pages sans paramètre d\'URL et ignore l\'espace privé', () => {
    expect(pageKey('/propager')).toBe('propager');
    expect(pageKey('/propager/heart-of-ice')).toBe('creation:heart-of-ice');
    expect(pageKey('/jouer')).toBe('jouer');
    expect(pageKey('/son/')).toBe('son');
    expect(pageKey('/admin')).toBeNull();
    expect(pageKey('/newsletter/desinscription')).toBeNull();
  });
});

describe('Navigation', () => {
  it('propose les cinq rubriques, sans l\'espace administrateur', () => {
    expect(NAV_LINKS.map((l) => l.path)).toEqual(['/propager', '/a-propos', '/chemin', '/jouer', '/son']);
  });
});
