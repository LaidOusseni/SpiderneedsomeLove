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
import PreorderForm from '../../components/PreorderForm/PreorderForm';
import MockupView from '../../components/MockupView/MockupView';
import ViewModeToggle from '../../components/ViewModeToggle/ViewModeToggle';
import { hasWebGL } from '../../three/webgl';
import { useIdlePrefetch3D, useViewMode } from '../../utils/viewMode';
import { fetchPreorderCount } from '../../services/preorderService';

const GarmentViewer = lazy(() => import('../../components/GarmentViewer/GarmentViewer'));

function PreorderPanel({ creation, count, onOpen }) {
  return (
    <div className={`${styles.votePanel} ${styles.preorderPanel}`}>
      <p className={styles.kicker}>DROP #01 — PRÉCOMMANDES OUVERTES</p>
      <h2 className={styles.voteTitle}>Le premier drop Love&Faith est là</h2>
      <p className={styles.voteText}>
        Ce modèle est le premier produit officiel Love&Faith et le seul actuellement disponible à la précommande.
      </p>
      <div className={styles.preorderSummary}>
        {Number.isInteger(count) ? (
          <>
            <strong>{count}</strong>
            <span>personne{count > 1 ? 's' : ''} intéressée{count > 1 ? 's' : ''}</span>
          </>
        ) : (
          <span>{count === null ? 'Chargement du nombre de personnes intéressées…' : 'Nombre de personnes intéressées indisponible.'}</span>
        )}
      </div>
      <button type="button" className={styles.voteBtn} onClick={onOpen}>
        <span className={styles.voteBtnLabel}>Précommander</span>
        <span className={styles.voteBtnHint}>Découvrir les modalités — sans paiement</span>
      </button>
      <p className={styles.small}>
        Cette création n'est pas un vote : manifeste ton intérêt, sans engagement d'achat.
        Les autres créations restent en compétition pour le prochain drop Love&Faith.
      </p>
    </div>
  );
}

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

const CreationDetail = () => {
  const { slug } = useParams();
  const creation = getCreation(slug);
  const results = useVoteResults();
  const viewerRef = useRef(null);
  const [voteFor, setVoteFor] = useState(null); // création figée à l'ouverture du formulaire
  const [preorderFor, setPreorderFor] = useState(null);
  const [preorderStep, setPreorderStep] = useState('information');
  const [preorderCount, setPreorderCount] = useState(null);
  const [preorderSession, setPreorderSession] = useState(0);
  const [params, setParams] = useSearchParams();
  const [can3D] = useState(hasWebGL);
  const [viewMode, setViewMode] = useViewMode(slug);
  useIdlePrefetch3D(viewMode === '2d');

  const openVote = useCallback(() => creation && setVoteFor(creation), [creation]);
  const closeVote = useCallback(() => setVoteFor(null), []);
  const openPreorder = useCallback(() => {
    if (!creation) return;
    setPreorderSession((current) => current + 1);
    setPreorderStep('information');
    setPreorderFor(creation);
  }, [creation]);
  const closePreorder = useCallback(() => {
    setPreorderStep('information');
    setPreorderFor(null);
  }, []);

  useEffect(() => {
    if (!creation || !creation.isCurrentDrop) return;
    let active = true;
    fetchPreorderCount().then((res) => {
      if (active) setPreorderCount(Number.isInteger(res.count) ? res.count : undefined);
    }).catch(() => {
      if (active) setPreorderCount(undefined);
    });
    return () => { active = false; };
  }, [creation]);

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
          {viewMode === '2d' ? (
            <div className={`${styles.viewerPane} ${styles.viewerPane2d}`} key="v2d">
              <MockupView creation={creation} />
            </div>
          ) : (
            <div className={styles.viewerPane} key="v3d">
              <Suspense fallback={<div className={styles.viewerLoading} role="status">Chargement de la figurine 3D…</div>}>
                <GarmentViewer ref={viewerRef} creation={creation} enableZoom={false} />
              </Suspense>
              <button type="button" className={styles.recenter} onClick={() => viewerRef.current?.reset()}>
                ⟲ Recentrer
              </button>
            </div>
          )}
        </div>

        <div className={styles.intro}>
          <p className={styles.kicker}>
            {status === 'current_drop'
              ? 'DROP ACTUEL — PRÉCOMMANDES OUVERTES'
              : status === 'historic'
                ? 'ANCIEN DROP — DÉJÀ SORTI'
                : 'Candidate au prochain drop'}
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

        {creation.isCurrentDrop ? (
          <PreorderPanel creation={creation} count={preorderCount} onOpen={openPreorder} />
        ) : (
          <VotePanel creation={creation} status={status} results={results} onVote={openVote} />
        )}
      </div>

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

      <Modal
        isOpen={Boolean(preorderFor)}
        onClose={closePreorder}
        labelledBy={preorderStep === 'information' ? 'preorder-info-title' : 'preorder-form-title'}
        className={styles.preorderModal}
      >
        {preorderFor && preorderStep === 'information' && (
          <section className={styles.preorderInfo} aria-labelledby="preorder-info-title">
            <p className={styles.kicker}>DROP #01 — BATMAN</p>
            <h2 id="preorder-info-title" className={styles.preorderInfoTitle}>PLUS ON EST NOMBREUX, MOINS ON PAIE.</h2>
            <p>
              Le prix dépendra du nombre de personnes intéressées et des conditions de production.
              En vous signalant, vous nous aidez à estimer les quantités et à négocier au mieux.
            </p>
            <div className={styles.priceRange}>
              <strong>25 € — 35 €</strong>
              <span>Fourchette de prix envisagée, non définitive.</span>
            </div>
            <p>
              Le prix définitif et les modalités de livraison seront communiqués avant toute commande.
              Vous ne payez rien maintenant : ce formulaire recueille uniquement votre intérêt.
            </p>
            <div className={styles.preorderInfoActions}>
              <button type="button" className={styles.voteBtn} onClick={() => setPreorderStep('form')}>
                Je souhaite participer
              </button>
              <button type="button" className={styles.preorderDismiss} onClick={closePreorder}>Pas maintenant</button>
            </div>
          </section>
        )}
        {preorderFor && preorderStep === 'form' && (
          <PreorderForm
            key={`${preorderFor.slug}-${preorderSession}`}
            creation={preorderFor}
            onSubmitted={(count) => {
              if (Number.isInteger(count)) setPreorderCount(count);
            }}
            onClose={closePreorder}
          />
        )}
      </Modal>
    </article>
  );
};

export default CreationDetail;
