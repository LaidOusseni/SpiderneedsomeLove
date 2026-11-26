/**
 * Bibliothèque « Le son de l'amour » : morceaux publiés dans Supabase (table public.music_tracks).
 * Les fichiers audio sont servis par le site (public/music) ; Supabase porte le statut de publication et l'ordre.
 */
import { supabase } from './supabase';
import { MUSIC_TRACKS } from '../constants/music';

const LOCAL = new Map(MUSIC_TRACKS.map((t) => [t.id, t]));

/** @returns {Promise<Array|null>} null si Supabase est injoignable (le catalogue local est alors utilisé) */
export async function fetchPublishedTracks() {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('music_tracks')
      .select('id, artist, title, file_path, mime_type, cover_path, duration_seconds, position')
      .order('position');
    if (error || !Array.isArray(data)) return null;
    return data.map((r) => ({
      id: r.id,
      artist: r.artist,
      title: r.title,
      src: r.file_path,
      type: r.mime_type,
      cover: r.cover_path ?? LOCAL.get(r.id)?.cover ?? null,
      duration: Number(r.duration_seconds) || LOCAL.get(r.id)?.duration || 0,
    }));
  } catch {
    return null;
  }
}
