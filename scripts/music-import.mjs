/**
 * Bibliothèque « Le son de l'amour » — npm run music:import
 *
 * Source : le dossier Music/ (fichiers nommés « Artiste - Titre.ext »). Les originaux ne sont JAMAIS modifiés.
 * Pour chaque morceau :
 *   - format réel détecté avec ffprobe (les .mpeg sont des MP3, les .mp4 de l'AAC sans vidéo) ;
 *   - copie à l'octet près dans public/music/<id>.mp3 | .m4a (extension correcte = lecture fiable sur Safari / iPhone) ;
 *   - pochette intégrée (s'il y en a une) extraite en WebP dans public/music/covers/<id>.webp ;
 *   - durée réelle lue dans le fichier.
 * Sorties : src/constants/music.js (catalogue du lecteur) et supabase/seed_music_tracks.sql (table music_tracks).
 * Ajouter un morceau : déposer « Artiste - Titre.ext » dans Music/, relancer ce script, puis exécuter le SQL généré.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const SRC = 'Music';
const OUT = 'public/music';
const COVERS = path.join(OUT, 'covers');
fs.mkdirSync(COVERS, { recursive: true });

const slugify = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/#/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const probe = (file) => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file], { encoding: 'utf8' }));

const files = fs.readdirSync(SRC).filter((f) => !f.startsWith('.')).sort((a, b) => a.localeCompare(b, 'fr'));
const tracks = [];
for (const file of files) {
  const full = path.join(SRC, file);
  const base = path.parse(file).name.trim();
  const sep = base.indexOf(' - ');
  if (sep < 0) { console.warn(`Ignoré (nom attendu « Artiste - Titre ») : ${file}`); continue; }
  const artist = base.slice(0, sep).trim();
  const title = base.slice(sep + 3).trim();
  const info = probe(full);
  const audio = info.streams.find((s) => s.codec_type === 'audio');
  if (!audio) { console.warn(`Ignoré (aucune piste audio) : ${file}`); continue; }
  const ext = audio.codec_name === 'mp3' ? 'mp3' : audio.codec_name === 'aac' ? 'm4a' : null;
  if (!ext) { console.warn(`Ignoré (format ${audio.codec_name} non pris en charge par les navigateurs) : ${file}`); continue; }

  const id = slugify(`${artist}-${title}`);
  const dest = path.join(OUT, `${id}.${ext}`);
  fs.copyFileSync(full, dest); // copie binaire identique, sans réencodage

  let cover = null;
  if (info.streams.some((s) => s.codec_type === 'video' && s.disposition?.attached_pic === 1)) {
    const coverFile = path.join(COVERS, `${id}.webp`);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', full, '-an', '-frames:v', '1', '-c:v', 'libwebp', '-quality', '86', coverFile]);
    cover = `/music/covers/${id}.webp`;
  }
  tracks.push({
    id,
    artist,
    title,
    src: `/music/${id}.${ext}`,
    type: ext === 'mp3' ? 'audio/mpeg' : 'audio/mp4',
    cover,
    duration: Math.round(Number(info.format.duration) * 10) / 10,
  });
}

const header = `/**
 * Catalogue « Le son de l'amour » — GÉNÉRÉ par scripts/music-import.mjs à partir du dossier Music/ (ne pas éditer à la main).
 * Sert de secours si Supabase (table music_tracks, statut de publication) est injoignable.
 */
`;
fs.writeFileSync('src/constants/music.js', `${header}export const MUSIC_TRACKS = ${JSON.stringify(tracks, null, 2)};\n`);

const q = (v) => (v === null ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
const rows = tracks.map((t, i) => `  (${q(t.id)}, ${q(t.artist)}, ${q(t.title)}, ${q(t.src)}, ${q(t.type)}, ${q(t.cover)}, ${t.duration}, ${i + 1})`);
fs.writeFileSync('supabase/seed_music_tracks.sql', `-- GÉNÉRÉ par scripts/music-import.mjs — ajoute les nouveaux morceaux sans modifier ceux déjà publiés ou retirés.
insert into public.music_tracks (id, artist, title, file_path, mime_type, cover_path, duration_seconds, position)
values
${rows.join(',\n')}
on conflict (id) do nothing;
`);
console.log(`${tracks.length} morceaux importés dans ${OUT}/ (${tracks.filter((t) => t.cover).length} pochettes).`);
