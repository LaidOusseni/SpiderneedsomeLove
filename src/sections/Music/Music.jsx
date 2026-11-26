import { useMemo } from 'react';
import styles from './Music.module.css';
import Turntable from './Turntable';
import { useMusicPlayer } from '../../context/MusicPlayerContext';

export const formatTime = (s) => {
  if (!Number.isFinite(s) || s < 0) return '0:00';
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
};

const Icon = ({ name }) => {
  const paths = {
    play: <path d="M8 5.5v13l11-6.5z" />,
    pause: <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" />,
    prev: <path d="M5 5h2.6v14H5zM19 5v14L8.6 12z" />,
    next: <path d="M16.4 5H19v14h-2.6zM5 5l10.4 7L5 19z" />,
    volume: <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4zM15 8.5a5 5 0 0 1 0 7M17.6 6a8.5 8.5 0 0 1 0 12" />,
    muted: <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4zM15.5 9.5l5 5M20.5 9.5l-5 5" />,
  };
  const stroke = name === 'volume' || name === 'muted';
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={stroke ? styles.iconStroke : styles.icon}>{paths[name]}</svg>
  );
};

/** Le son de l'amour — tourne-disque Love&Faith et bibliothèque des morceaux des Lovers. */
const Music = () => {
  const p = useMusicPlayer();
  const { current, time } = p;
  const duration = time.duration || current?.duration || 0;
  const progress = duration ? Math.min(100, (time.current / duration) * 100) : 0;
  const spinning = p.status === 'playing' || p.status === 'loading';
  const artists = useMemo(() => [...new Set(p.tracks.map((t) => t.artist))], [p.tracks]);

  return (
    <section className={styles.page} aria-labelledby="music-title">
      <h1 id="music-title" className={styles.srOnly}>Le son de l'amour</h1>

      <div className={styles.player}>
        <header className={styles.now} aria-live="polite">
          {current?.cover && <img src={current.cover} alt="" className={styles.nowCover} width="56" height="56" />}
          <div className={styles.nowText}>
            <p className={styles.nowArtist}>{current?.artist}</p>
            <p className={styles.nowTitle}>{current?.title}</p>
          </div>
        </header>

        <div className={styles.deck}>
          <Turntable
            spinning={spinning}
            armOn={spinning}
            label={current ? `Tourne-disque Love&Faith — ${current.artist}, ${current.title}${spinning ? ' (lecture en cours)' : ''}` : 'Tourne-disque Love&Faith'}
          />
        </div>

        <div className={styles.controls}>
          <div className={styles.progressRow}>
            <span className={styles.time}>{formatTime(time.current)}</span>
            <input
              type="range"
              className={styles.progress}
              min="0"
              max={Math.max(1, Math.floor(duration))}
              step="1"
              value={Math.floor(time.current)}
              onChange={(e) => p.seek(Number(e.target.value))}
              style={{ '--pct': `${progress}%` }}
              aria-label="Position dans le morceau"
              aria-valuetext={`${formatTime(time.current)} sur ${formatTime(duration)}`}
              disabled={p.status === 'idle'}
            />
            <span className={styles.time}>{formatTime(duration)}</span>
          </div>

          <div className={styles.buttons}>
            <button type="button" className={styles.skip} onClick={p.prev} aria-label="Morceau précédent"><Icon name="prev" /></button>
            <button
              type="button"
              className={styles.playBtn}
              onClick={p.toggle}
              aria-label={spinning ? 'Pause' : 'Lecture'}
              aria-pressed={spinning}
            >
              <Icon name={spinning ? 'pause' : 'play'} />
            </button>
            <button type="button" className={styles.skip} onClick={p.next} aria-label="Morceau suivant"><Icon name="next" /></button>
          </div>

          <div className={styles.volumeRow}>
            <button type="button" className={styles.mute} onClick={p.toggleMute} aria-label={p.muted ? 'Réactiver le son' : 'Couper le son'} aria-pressed={p.muted}>
              <Icon name={p.muted || p.volume === 0 ? 'muted' : 'volume'} />
            </button>
            <input
              type="range"
              className={styles.volume}
              min="0"
              max="100"
              value={p.muted ? 0 : Math.round(p.volume * 100)}
              onChange={(e) => p.setVolume(Number(e.target.value) / 100)}
              style={{ '--pct': `${p.muted ? 0 : Math.round(p.volume * 100)}%` }}
              aria-label="Volume"
            />
          </div>
          {p.status === 'error' && (
            <p className={styles.error} role="alert">Ce morceau ne peut pas être lu pour le moment. Essaie le suivant ou réessaie dans un instant.</p>
          )}
        </div>
      </div>

      <section className={styles.library} aria-labelledby="library-title">
        <h2 id="library-title" className={styles.libraryTitle}>Les morceaux des Lovers</h2>
        <p className={styles.libraryIntro}>
          {p.tracks.length} morceaux · {artists.join(', ')}
        </p>
        <ol className={styles.list}>
          {p.tracks.map((t, i) => {
            const active = i === p.index && p.status !== 'idle';
            return (
              <li key={t.id}>
                <button
                  type="button"
                  className={`${styles.trackBtn} ${active ? styles.trackActive : ''}`}
                  onClick={() => (i === p.index && p.status !== 'idle' ? p.toggle() : p.goTo(i, { autoplay: true }))}
                  aria-current={i === p.index ? 'true' : undefined}
                  aria-label={`${t.artist} — ${t.title}${active && spinning ? ', en lecture' : ''}`}
                >
                  <span className={styles.trackNum} aria-hidden="true">
                    {active && spinning ? <span className={styles.eq}><i /><i /><i /></span> : String(i + 1).padStart(2, '0')}
                  </span>
                  {t.cover
                    ? <img src={t.cover} alt="" className={styles.trackCover} width="44" height="44" loading="lazy" />
                    : <span className={styles.trackDisc} aria-hidden="true" />}
                  <span className={styles.trackText}>
                    <span className={styles.trackTitle}>{t.title}</span>
                    <span className={styles.trackArtist}>{t.artist}</span>
                  </span>
                  <span className={styles.trackTime}>{formatTime(t.duration)}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </section>
    </section>
  );
};

export default Music;
