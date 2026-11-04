import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import styles from './CreationDetail.module.css';
import { CANDIDATES, CREATIONS, getCreation } from '../../constants/creations';
import { useVoteResults } from '../../context/VoteResultsContext';
import { canVote, resolveCreationStatus } from '../../utils/creationStatus';
import { computeStandings } from '../../utils/voteStats';
import { VOTE_TEXTS } from '../../constants/site';
import StatusBadge from '../../components/StatusBadge/StatusBadge';
import ProgressGauge from '../../components/ProgressGauge/ProgressGauge';
import Modal from '../../components/Modal/Modal';
import VoteForm from '../../components/VoteForm/VoteForm';
import MockupView from '../../components/MockupView/MockupView';
import ViewModeToggle from '../../components/ViewModeToggle/ViewModeToggle';
import { hasWebGL } from '../../three/webgl';
import { useViewMode } from '../../utils/viewMode';

const GarmentViewer = lazy(() => import('../../components/GarmentViewer/GarmentViewer'));

function VotePanel({ creation, status, results, onVote }) {
  const standing = useMemo(() => {
    if (results.status !== 'ready') return null;
    const { rows, total } = computeStandings(
      CANDIDATES.map((c) => ({ slug: c.slug, votes: results.bySlug[c.slug]?.votes ?? 0 })),
    );
    return { row: rows.find((r) => r.slug === creation.slug), total };
  }, [results, creation.slug]);

  if (status === 'historic') {
    return (
      <div className={styles.votePanel}>
        <h2 className={styles.voteTitle}>Création historique</h2>
        <p className={styles.voteText}>
          {creation.name} est déjà sortie. Elle reste consultable ici, mais ne participe pas au vote du prochain drop.
        </p>
        <Link to="/propager" className={styles.secondaryBtn}>Voir les candidates</Link>
      </div>
    );
  }

  const votable = canVote(creation, results);
  return (
    <div className={`${styles.votePanel} ${status === 'winner' ? styles.winnerPanel : ''}`}>
      <h2 className={styles.voteTitle}>
        {status === 'winner' ? 'Création retenue pour le prochain drop' : 'Choisis le prochain drop'}
      </h2>
      <p className={styles.voteText}>{VOTE_TEXTS.drop}</p>

      {standing?.row ? (
        <div className={styles.voteStats}>
          <ProgressGauge share={standing.row.share} votes={standing.row.votes} label={creation.name} size="lg"
            highlight={status === 'winner'} />
          <p className={styles.voteNote}>
            Part des votes exprimés sur les {CANDIDATES.length} candidates ({standing.total} vote{standing.total > 1 ? 's' : ''} au total).
            {status === 'candidate' && ' Résultats provisoires.'}
          </p>
        </div>
      ) : (
        <p className={styles.voteNote}>
          {results.status === 'loading' ? 'Chargement des résultats…' : 'Les résultats ne sont pas disponibles pour le moment.'}
        </p>
      )}

      {votable ? (
        <button type="button" className={styles.voteBtn} onClick={onVote}>
          <span className={styles.voteBtnLabel}>Je choisis ce T-shirt</span>
          <span className={styles.voteBtnHint}>Faire entendre ma voix — gratuit, sans commande ni paiement</span>
        </button>
      ) : (
        <p className={styles.voteDisabled} role="status">
          {status === 'closed' && 'Les votes sont clôturés. Les résultats restent consultables sur « Suivez le chemin de l\'amour ».'}
          {status === 'winner' && 'Les votes sont terminés : cette création a été officiellement retenue.'}
          {status === 'not_selected' && 'Les votes sont terminés pour ce drop.'}
          {(status === 'preparing' || status === 'candidate') && 'Le vote n\'est pas encore ouvert. Suis nos réseaux pour savoir quand il commence.'}
        </p>
      )}
      <p className={styles.small}>{VOTE_TEXTS.rule}</p>
      <Link to="/chemin" className={styles.resultsLink}>Voir le classement — Le chemin de l'amour →</Link>
    </div>
  );
}

function Gallery({ creation }) {
  const [zoom, setZoom] = useState(null);
  const items = [
    { key: 'front', label: 'Devant', src: creation.mockups.front },
    { key: 'back', label: creation.garment.prints.back || creation.mockupsAreCovers ? 'Dos' : 'Dos (uni)', src: creation.mockups.back },
  ];
  return (
    <section className={styles.gallery} aria-labelledby="gallery-title">
      <h2 id="gallery-title" className={styles.sectionTitle}>
        {creation.mockupsAreCovers ? 'Les couvertures du Tome I' : 'Le T-shirt, devant et dos'}
      </h2>
      <div className={styles.galleryGrid}>
        {items.map((it) => (
          <figure key={it.key} className={styles.figure}>
            <button type="button" className={`${styles.figureBtn} ${creation.mockupsAreCovers ? styles.figureFramed : ''}`}
              onClick={() => setZoom(it)} aria-label={`Agrandir — ${it.label}`}>
              <img src={it.src} alt={`${creation.name} — ${it.label.toLowerCase()}`} loading="lazy" decoding="async"
                className={styles.floating} />
            </button>
            <figcaption>{it.label}</figcaption>
          </figure>
        ))}
      </div>
      <Modal isOpen={Boolean(zoom)} onClose={() => setZoom(null)}>
        {zoom && (
          <img src={zoom.src} alt={`${creation.name} — ${zoom.label.toLowerCase()}`}
            className={`${styles.zoomImg} ${creation.mockupsAreCovers ? styles.zoomFramed : ''}`} />
        )}
      </Modal>
    </section>
  );
}

const CreationDetail = () => {
  const { slug } = useParams();
  const creation = getCreation(slug);
  const results = useVoteResults();
  const viewerRef = useRef(null);
  const [voteFor, setVoteFor] = useState(null); // création figée à l'ouverture du formulaire
  const [params, setParams] = useSearchParams();
  const [can3D] = useState(hasWebGL);
  const [viewMode, setViewMode] = useViewMode();

  const openVote = useCallback(() => creation && setVoteFor(creation), [creation]);
  const closeVote = useCallback(() => setVoteFor(null), []);

  // Lien « Je vote pour cette création » (sélection) : /propager/<slug>?voter=1 ouvre le formulaire de CETTE création,
  // dès que les résultats confirment que le vote est ouvert. Le paramètre est retiré ensuite (pas de réouverture).
  const wantsVote = params.get('voter') === '1';
  const votableNow = creation ? canVote(creation, results) : false;
  useEffect(() => {
    if (!wantsVote || results.status === 'loading') return;
    if (votableNow) setVoteFor(creation);
    setParams({}, { replace: true });
  }, [wantsVote, votableNow, results.status, creation, setParams]);

  if (!creation) return <Navigate to="/propager" replace />;

  const status = resolveCreationStatus(creation, results);
  const i = CREATIONS.findIndex((c) => c.slug === creation.slug);
  const prev = CREATIONS[(i - 1 + CREATIONS.length) % CREATIONS.length];
  const next = CREATIONS[(i + 1) % CREATIONS.length];

  return (
    <article className={styles.page}>
      <div className={styles.topBar}>
        <Link to={`/propager?c=${creation.slug}`} className={styles.back}>← Retour à la sélection</Link>
        <StatusBadge status={status} />
      </div>

      <header className={styles.hero}>
        <div className={styles.viewerBox}>
          <div className={styles.modeBar}>
            <ViewModeToggle mode={viewMode} onChange={setViewMode} can3D={can3D} />
          </div>
          {viewMode === '3d' ? (
            <div className={styles.viewerPane} key="v3d">
              <Suspense fallback={<div className={styles.viewerLoading}>Chargement…</div>}>
                <GarmentViewer ref={viewerRef} creation={creation} enableZoom={false} />
              </Suspense>
              <button type="button" className={styles.recenter} onClick={() => viewerRef.current?.reset()}>
                ⟲ Recentrer
              </button>
            </div>
          ) : (
            <div className={`${styles.viewerPane} ${styles.viewerPane2d}`} key="v2d">
              <MockupView creation={creation} />
            </div>
          )}
        </div>

        <div className={styles.intro}>
          <p className={styles.kicker}>
            {status === 'historic' ? 'Création historique — déjà sortie' : 'Candidate au prochain drop'}
          </p>
          <h1 className={styles.name}>{creation.name}</h1>
          {creation.subtitle && <p className={styles.subtitle}>{creation.subtitle}</p>}
          {creation.tagline && <p className={styles.tagline}>« {creation.tagline} »</p>}
          {creation.message && <blockquote className={styles.message}>{creation.message}</blockquote>}
          <a href="#histoire" className={styles.readMore}>Lire son histoire ↓</a>
        </div>
      </header>

      <div className={styles.body}>
        <section id="histoire" className={styles.story} aria-labelledby="story-title">
          <h2 id="story-title" className={styles.sectionTitle}>Son histoire</h2>
          {creation.story.map((p, k) => <p key={k}>{p}</p>)}
          {import.meta.env.DEV && creation.storyTodo && (
            <p className={styles.todo}>À compléter : {creation.storyTodo}</p>
          )}
        </section>

        <VotePanel creation={creation} status={status} results={results} onVote={openVote} />
      </div>

      <Gallery creation={creation} />

      <nav className={styles.pager} aria-label="Autres créations">
        <Link to={`/propager/${prev.slug}`} className={styles.pagerLink}>
          <span>← Précédente</span>
          <strong>{prev.name}</strong>
        </Link>
        <Link to={`/propager/${next.slug}`} className={`${styles.pagerLink} ${styles.pagerNext}`}>
          <span>Suivante →</span>
          <strong>{next.name}</strong>
        </Link>
      </nav>

      <Modal isOpen={Boolean(voteFor)} onClose={closeVote}>
        {voteFor && (
          <VoteForm
            key={voteFor.slug}
            creation={voteFor}
            onVoted={results.applyVoteResult}
            onClose={closeVote}
          />
        )}
      </Modal>
    </article>
  );
};

export default CreationDetail;
