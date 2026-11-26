-- GÉNÉRÉ par scripts/music-import.mjs — ajoute les nouveaux morceaux sans modifier ceux déjà publiés ou retirés.
insert into public.music_tracks (id, artist, title, file_path, mime_type, cover_path, duration_seconds, position)
values
  ('barty-pour-oublier', 'Barty', 'Pour oublier', '/music/barty-pour-oublier.m4a', 'audio/mp4', null, 110.3, 1),
  ('cooper-la-haine-1', 'Cooper', 'La haine #1', '/music/cooper-la-haine-1.mp3', 'audio/mpeg', null, 187.9, 2),
  ('cooper-la-haine-2', 'Cooper', 'La haine #2', '/music/cooper-la-haine-2.mp3', 'audio/mpeg', null, 132.7, 3),
  ('mwl-croire-en-nous', 'MWL', 'Croire en nous', '/music/mwl-croire-en-nous.mp3', 'audio/mpeg', null, 166.3, 4),
  ('mwl-death-note', 'MWL', 'Death note', '/music/mwl-death-note.mp3', 'audio/mpeg', '/music/covers/mwl-death-note.webp', 188.8, 5),
  ('mwl-encorps', 'MWL', 'EnCORPS', '/music/mwl-encorps.mp3', 'audio/mpeg', '/music/covers/mwl-encorps.webp', 146.4, 6),
  ('mwl-malavivre', 'MWL', 'Malavivre', '/music/mwl-malavivre.mp3', 'audio/mpeg', '/music/covers/mwl-malavivre.webp', 132.8, 7),
  ('mwl-ne-m-abandonne-pas', 'MWL', 'Ne m''abandonne pas', '/music/mwl-ne-m-abandonne-pas.mp3', 'audio/mpeg', null, 158.5, 8),
  ('mwl-realise-mes-voeux', 'MWL', 'Réalise mes voeux', '/music/mwl-realise-mes-voeux.mp3', 'audio/mpeg', null, 234.2, 9),
  ('mwl-sensation', 'MWL', 'Sensation', '/music/mwl-sensation.mp3', 'audio/mpeg', '/music/covers/mwl-sensation.webp', 150, 10),
  ('rakeem-duc', 'Rakeem', 'DUC', '/music/rakeem-duc.m4a', 'audio/mp4', null, 190.5, 11),
  ('rakeem-sonbody', 'Rakeem', 'SonBody', '/music/rakeem-sonbody.m4a', 'audio/mp4', null, 104.8, 12)
on conflict (id) do nothing;
