import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { MUSIC_TRACKS } from '../constants/music';
import { fetchPublishedTracks } from '../services/musicService';
import { flushAnalytics, track } from '../services/analytics';

/**
 * Lecteur « Le son de l'amour », partagé par tout le site : un seul élément <audio>, créé au premier Play,
 * qui survit aux changements de page (la musique ne se coupe pas en naviguant).
 *
 * Chargement : une seule piste à la fois, uniquement quand on la lance (preload = none).
 * Comptage (aucun doublon au rechargement d'un composant : tout est rattaché à une « écoute » = une piste chargée) :
 *   music_start     premier démarrage effectif de la piste (événement « playing »)
 *   music_listen    écoute significative : 30 s réellement jouées, ou la moitié d'un morceau plus court
 *   music_complete  morceau écouté jusqu'au bout
 *   music_time      secondes réellement jouées (envoyées à la pause, au changement de piste, en quittant la page)
 *   music_pause     pause demandée par l'auditeur
 *   music_skip      passage à un autre morceau avant la fin
 */
const MusicPlayerContext = createContext(null);
const VOLUME_KEY = 'lf-music-volume';
const SIGNIFICANT_SECONDS = 30;

function readVolume() {
  try {
    const v = JSON.parse(localStorage.getItem(VOLUME_KEY) ?? 'null');
    if (v && typeof v.volume === 'number') return { volume: Math.min(1, Math.max(0, v.volume)), muted: Boolean(v.muted) };
  } catch { /* stockage indisponible */ }
  return { volume: 0.85, muted: false };
}

export function MusicPlayerProvider({ children }) {
  const [tracks, setTracks] = useState(MUSIC_TRACKS);
  const [index, setIndex] = useState(0);
  const [status, setStatus] = useState('idle'); // idle | loading | playing | paused | error
  const [time, setTime] = useState({ current: 0, duration: 0 });
  const [{ volume, muted }, setVolumeState] = useState(readVolume);
  const audioRef = useRef(null);
  const listen = useRef(null); // écoute en cours : { id, started, significant, played, unsent, lastTime }
  const wantPlay = useRef(false);
  const tracksRef = useRef(tracks);
  tracksRef.current = tracks;
  const indexRef = useRef(index);
  indexRef.current = index;

  // Bibliothèque publiée (Supabase) ; en cas d'indisponibilité, le catalogue local reste utilisé
  useEffect(() => {
    let active = true;
    fetchPublishedTracks().then((list) => { if (active && list?.length) setTracks(list); });
    return () => { active = false; };
  }, []);

  const flushTime = useCallback(() => {
    const l = listen.current;
    if (l && l.unsent >= 0.5) {
      track('music_time', { track: l.id, value: l.unsent, page: 'son' });
      l.unsent = 0;
    }
  }, []);

  const getAudio = useCallback(() => {
    if (audioRef.current) return audioRef.current;
    const audio = new Audio();
    audio.preload = 'none';
    audioRef.current = audio;
    return audio;
  }, []);

  const load = useCallback((i, { play }) => {
    const list = tracksRef.current;
    const t = list[(i + list.length) % list.length];
    if (!t) return;
    const audio = getAudio();
    flushTime();
    listen.current = { id: t.id, started: false, significant: false, played: 0, unsent: 0, lastTime: 0 };
    setIndex((i + list.length) % list.length);
    setTime({ current: 0, duration: t.duration || 0 });
    audio.src = t.src;
    wantPlay.current = play;
    if (play) {
      setStatus('loading');
      audio.play().catch((err) => { if (err?.name !== 'AbortError') setStatus('error'); });
    } else {
      setStatus('paused');
    }
  }, [getAudio, flushTime]);

  // Événements de l'élément audio (une seule fois pour toute la vie du site)
  useEffect(() => {
    const audio = getAudio();
    audio.volume = volume;
    audio.muted = muted;
    const onPlaying = () => {
      setStatus('playing');
      const l = listen.current;
      if (l && !l.started) {
        l.started = true;
        track('music_start', { track: l.id, page: 'son' });
      }
    };
    const onPause = () => setStatus((s) => (s === 'error' ? s : 'paused'));
    const onWaiting = () => wantPlay.current && setStatus('loading');
    const onTime = () => {
      const l = listen.current;
      const now = audio.currentTime;
      setTime({ current: now, duration: Number.isFinite(audio.duration) ? audio.duration : (tracksRef.current[indexRef.current]?.duration || 0) });
      if (!l || audio.paused) { if (l) l.lastTime = now; return; }
      const delta = now - l.lastTime;
      l.lastTime = now;
      if (delta > 0 && delta < 1.5) { // temps réellement écouté (un déplacement dans le morceau n'est pas compté)
        l.played += delta;
        l.unsent += delta;
        const d = audio.duration;
        if (!l.significant && (l.played >= SIGNIFICANT_SECONDS || (Number.isFinite(d) && d > 0 && l.played >= d / 2))) {
          l.significant = true;
          track('music_listen', { track: l.id, page: 'son' });
        }
        if (l.unsent >= 60) flushTime();
      }
    };
    const onEnded = () => {
      const l = listen.current;
      flushTime();
      if (l) track('music_complete', { track: l.id, page: 'son' });
      load(indexRef.current + 1, { play: true }); // enchaînement automatique (retour au début après le dernier)
    };
    const onError = () => { if (audio.getAttribute('src')) setStatus('error'); };
    const onSeeked = () => { if (listen.current) listen.current.lastTime = audio.currentTime; };
    const onHide = () => { flushTime(); flushAnalytics({ keepalive: true }); };
    audio.addEventListener('playing', onPlaying);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('waiting', onWaiting);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onTime);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);
    audio.addEventListener('seeked', onSeeked);
    window.addEventListener('pagehide', onHide);
    return () => {
      audio.removeEventListener('playing', onPlaying);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('waiting', onWaiting);
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onTime);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
      audio.removeEventListener('seeked', onSeeked);
      window.removeEventListener('pagehide', onHide);
    };
    // volume / muted appliqués par leur propre effet
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getAudio, load, flushTime]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) { audio.volume = volume; audio.muted = muted; }
    try { localStorage.setItem(VOLUME_KEY, JSON.stringify({ volume, muted })); } catch { /* */ }
  }, [volume, muted]);

  const play = useCallback(() => {
    const audio = getAudio();
    if (!audio.getAttribute('src')) { load(indexRef.current, { play: true }); return; }
    wantPlay.current = true;
    if (status === 'error') { load(indexRef.current, { play: true }); return; }
    setStatus((s) => (s === 'playing' ? s : 'loading'));
    audio.play().catch((err) => { if (err?.name !== 'AbortError') setStatus('error'); });
  }, [getAudio, load, status]);

  const pause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || audio.paused) return;
    wantPlay.current = false;
    audio.pause();
    flushTime();
    if (listen.current) track('music_pause', { track: listen.current.id, page: 'son' });
  }, [flushTime]);

  const playing = status === 'playing' || status === 'loading';
  const toggle = useCallback(() => (playing ? pause() : play()), [playing, pause, play]);

  /** Changer de morceau : compté comme « passage » si le morceau en cours avait démarré et n'était pas fini. */
  const goTo = useCallback((i, { autoplay } = {}) => {
    const l = listen.current;
    if (l?.started) track('music_skip', { track: l.id, page: 'son' });
    load(i, { play: autoplay ?? (playing || status === 'idle') });
  }, [load, playing, status]);

  const next = useCallback(() => goTo(indexRef.current + 1), [goTo]);
  const prev = useCallback(() => {
    const audio = audioRef.current;
    if (audio && audio.currentTime > 3) { audio.currentTime = 0; return; } // comme un lecteur classique
    goTo(indexRef.current - 1);
  }, [goTo]);

  const seek = useCallback((seconds) => {
    const audio = audioRef.current;
    if (!audio || !audio.getAttribute('src')) return;
    const d = Number.isFinite(audio.duration) ? audio.duration : time.duration;
    audio.currentTime = Math.max(0, Math.min(d || 0, seconds));
    setTime((t) => ({ ...t, current: audio.currentTime }));
  }, [time.duration]);

  const setVolume = useCallback((v) => setVolumeState({ volume: Math.min(1, Math.max(0, v)), muted: v === 0 ? true : false }), []);
  const toggleMute = useCallback(() => setVolumeState((s) => ({ volume: s.volume || 0.6, muted: !s.muted })), []);

  const stop = useCallback(() => {
    const audio = audioRef.current;
    pause();
    if (audio) audio.currentTime = 0;
    setStatus('idle');
  }, [pause]);

  // Commandes de l'écran verrouillé / casque (téléphones)
  const current = tracks[index];
  useEffect(() => {
    if (!('mediaSession' in navigator) || !current || status === 'idle') return;
    try {
      navigator.mediaSession.metadata = new window.MediaMetadata({
        title: current.title,
        artist: current.artist,
        album: "Le son de l'amour — Love&Faith",
        artwork: [{ src: current.cover ?? '/brand/icon-512.png', sizes: '512x512' }],
      });
      navigator.mediaSession.setActionHandler('play', play);
      navigator.mediaSession.setActionHandler('pause', pause);
      navigator.mediaSession.setActionHandler('nexttrack', next);
      navigator.mediaSession.setActionHandler('previoustrack', prev);
    } catch { /* non pris en charge */ }
  }, [current, status, play, pause, next, prev]);

  const value = useMemo(() => ({
    tracks, index, current, status, playing, time, volume, muted,
    play, pause, toggle, next, prev, goTo, seek, setVolume, toggleMute, stop,
  }), [tracks, index, current, status, playing, time, volume, muted, play, pause, toggle, next, prev, goTo, seek, setVolume, toggleMute, stop]);

  return <MusicPlayerContext.Provider value={value}>{children}</MusicPlayerContext.Provider>;
}

export function useMusicPlayer() {
  const ctx = useContext(MusicPlayerContext);
  if (!ctx) throw new Error('useMusicPlayer doit être utilisé dans MusicPlayerProvider');
  return ctx;
}
