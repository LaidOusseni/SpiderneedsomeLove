import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import styles from './Propager.module.css';
import { CANDIDATES, CREATIONS, CURRENT_DROP, getCreation } from '../../constants/creations';
import { useVoteResults } from '../../context/VoteResultsContext';
import { canVote, resolveCreationStatus } from '../../utils/creationStatus';
import { useIdlePrefetch3D, useViewMode } from '../../utils/viewMode';
import { computeStandings, formatShare, formatVotes } from '../../utils/voteStats';
import StatusBadge from '../../components/StatusBadge/StatusBadge';
import ViewModeToggle from '../../components/ViewModeToggle/ViewModeToggle';
import MockupView from '../../components/MockupView/MockupView';
import { BRAND_ASSETS } from '../../constants/site';
import { hasWebGL } from '../../three/webgl';

const GarmentViewer = lazy(() => import('../../components/GarmentViewer/GarmentViewer'));

const isTyping = (el) =>
  el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);

/** Précharge discrètement les textures d'une création (survol d'une icône). */
const prefetched = new Set();
function prefetch(creation) {
  if (prefetched.has(creation.slug)) return;
  prefetched.add(creation.slug);
  Object.values(creation.garment.prints).forEach((p) => { const img = new Image(); img.src = p.src; });
}

function Tile({ creation, selected, onSelect, number }) {
  const isHistoric = creation.status === 'historic';
  const badgeLabel = creation.isCurrentDrop ? 'Drop actuel' : isHistoric ? 'Ancien drop' : 'Candidate';
  return (
    <button
      type="button"
      className={`${styles.tile} ${selected ? styles.tileSelected : ''}`}
      onClick={() => onSelect(creation.slug)}
      onMouseEnter={() => prefetch(creation)}
      onFocus={() => prefetch(creation)}
      aria-pressed={selected}
      aria-label={`${creation.name}${creation.subtitle ? ` — ${creation.subtitle}` : ''} — ${badgeLabel}`}
    >
      <span className={styles.tileImgWrap}>
        <img src={creation.icon} alt="" className={styles.tileImg} loading="lazy" decoding="async" />
      </span>
      <span className={styles.tileNum} aria-hidden="true">{number}</span>
      <span className={styles.tileName}>{creation.name}</span>
      <span className={`${styles.tileStatus} ${creation.isCurrentDrop ? styles.tileStatusCurrent : ''} ${isHistoric ? styles.tileStatusHistoric : ''}`}>
        {badgeLabel}
      </span>
      {selected && <span className={styles.tileP1} aria-hidden="true">P1</span>}
    </button>
  );
}

const Propager = () => {
  const [params, setParams] = useSearchParams();
  const selected = getCreation(params.get('c'));
  const results = useVoteResults();
  const viewerRef = useRef(null);
  const [can3D] = useState(hasWebGL);
  const [viewMode, changeViewMode] = useViewMode();
  useIdlePrefetch3D(Boolean(selected) && viewMode === '2d');

  const select = useCallback((slug) => setParams(slug ? { c: slug } : {}, { replace: true }), [setParams]);

  const step = useCallback((dir) => {
    const list = CREATIONS;
    const i = selected ? list.findIndex((c) => c.slug === selected.slug) : -1;
    const next = i < 0 ? (dir > 0 ? 0 : list.length - 1) : (i + dir + list.length) % list.length;
    select(list[next].slug);
  }, [selected, select]);

  // Clavier : ← → pour changer, Échap pour revenir à la sélection — jamais pendant une saisie
  useEffect(() => {
    const onKey = (e) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      if (isTyping(document.activeElement) || document.querySelector('[role="dialog"]')) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
      else if (e.key === 'Escape' && selected) select(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step, select, selected]);

  const standing = useMemo(() => {
    if (results.status !== 'ready') return {};
    const { rows } = computeStandings(CANDIDATES.map((c) => ({ slug: c.slug, votes: results.bySlug[c.slug]?.votes ?? 0 })));
    return Object.fromEntries(rows.map((r) => [r.slug, r]));
  }, [results]);

  const status = selected ? resolveCreationStatus(selected, results) : null;
  const position = selected ? CREATIONS.findIndex((c) => c.slug === selected.slug) + 1 : 0;
  const stat = selected ? standing[selected.slug] : null;

  return (
    <section className={`${styles.page} ${selected ? styles.isSelected : ''}`} aria-label="Propager l'amour — sélection des créations">
      {/* ── Scène ── */}
      <div className={styles.stage}>
        <div className={styles.stageBg} aria-hidden="true">
          <div className={styles.grid} />
          <div className={styles.halo} />
          <div className={styles.spot} />
          <div className={styles.floor} />
        </div>

        {/* Sélecteur Vue 3D / Vue 2D — au-dessus de la zone des vêtements */}
        <div className={styles.modeBar}>
          <ViewModeToggle mode={viewMode} onChange={changeViewMode} can3D={can3D} />
        </div>

        {!selected && (
          <div className={styles.empty}>
            <img src={BRAND_ASSETS.logo2d} alt="" className={styles.emptyLogo} aria-hidden="true" />
            <h1 className={styles.emptyTitle}>Choisis comment propager l'amour.</h1>
            <p className={styles.emptyText}>
              {CANDIDATES.length} créations sont en compétition. Une seule deviendra le prochain drop,
              portée par toute la communauté. Sélectionne une icône pour la découvrir.
            </p>
          </div>
        )}

        {selected && (
          <>
            {viewMode === '2d' ? (
              <div className={`${styles.viewer} ${styles.viewer2d}`} key="viewer-2d">
                <MockupView creation={selected} />
              </div>
            ) : (
              <div className={styles.viewer} key="viewer-3d">
                <Suspense fallback={<div className={styles.viewerLoading} role="status">Chargement de la figurine 3D…</div>}>
                  <GarmentViewer ref={viewerRef} creation={selected} />
                </Suspense>
              </div>
            )}

            <div className={styles.nameplate} key={selected.slug} aria-live="polite">
              <span className={styles.slash} aria-hidden="true" />
              <p className={styles.counter}>
                {String(position).padStart(2, '0')} <span>/ {String(CREATIONS.length).padStart(2, '0')}</span>
              </p>
              <h1 className={styles.name}>{selected.name}</h1>
              {selected.subtitle && <p className={styles.subtitle}>{selected.subtitle}</p>}
              <div className={styles.meta}>
                <StatusBadge status={status} />
                {stat && status !== 'historic' && (
                  <span className={styles.hud}>{formatVotes(stat.votes)} · {formatShare(stat.share)}</span>
                )}
              </div>
              {selected.tagline && <p className={styles.tagline}>« {selected.tagline} »</p>}
              {selected.isCurrentDrop && (
                <p className={styles.currentDropNotice}>Précommandes ouvertes</p>
              )}
            </div>

            <div className={styles.tools}>
              {viewMode === '3d' && (
                <button type="button" className={styles.tool} onClick={() => viewerRef.current?.reset()} aria-label="Recentrer la figurine">
                  <span aria-hidden="true">⟲</span> <span className={styles.toolLabel}>Recentrer</span>
                </button>
              )}
              <button type="button" className={styles.tool} onClick={() => select(null)} aria-label="Retour à la sélection">
                <span aria-hidden="true">▦</span> <span className={styles.toolLabel}>Retour à la sélection</span>
              </button>
            </div>

            {viewMode === '3d' && (
              <p className={styles.dragHint} aria-hidden="true">Glisse pour tourner · molette ou pincement pour zoomer</p>
            )}

            <div className={styles.actions}>
              <Link to={`/propager/${selected.slug}`} className={styles.choose}>
                <span className={styles.chooseLabel}>Cliquez pour choisir</span>
                <span className={styles.chooseHint}>Découvrir son histoire{status === 'candidate' ? ' et voter' : ''}</span>
              </Link>
              {canVote(selected, results) && (
                <Link to={`/propager/${selected.slug}?voter=1`} className={styles.voteLink}>
                  Je vote pour cette création →
                </Link>
              )}
            </div>
          </>
        )}

        <button type="button" className={`${styles.arrow} ${styles.arrowLeft}`} onClick={() => step(-1)} aria-label="Création précédente">
          ‹
        </button>
        <button type="button" className={`${styles.arrow} ${styles.arrowRight}`} onClick={() => step(1)} aria-label="Création suivante">
          ›
        </button>
      </div>

      {/* ── Panneau de sélection ── */}
      <aside id="creations" className={styles.panel} aria-label="Créations">
        <div className={styles.panelGroup}>
          {CURRENT_DROP && (
            <div className={styles.currentDropCard}>
              <img src={CURRENT_DROP.icon} alt="" className={styles.currentDropIcon} />
              <span className={styles.currentDropBadge}>DROP ACTUEL</span>
              <h2 className={styles.currentDropTitle}>{CURRENT_DROP.name}</h2>
              <p className={styles.currentDropStatus}>Précommandes ouvertes</p>
              <Link to={`/propager/${CURRENT_DROP.slug}`} className={styles.currentDropButton}>Précommander</Link>
            </div>
          )}
          <h2 className={styles.panelTitle}>
            Prochaines créations <span>{CANDIDATES.length} candidates</span>
          </h2>
          <div className={styles.tiles}>
            {CANDIDATES.map((c) => (
              <Tile key={c.slug} creation={c} number={String(c.index + 1).padStart(2, '0')}
                selected={selected?.slug === c.slug} onSelect={select} />
            ))}
          </div>
          <h2 className={styles.panelTitle}>
            Anciens drops <span>{CREATIONS.filter((c) => c.status === 'historic').length}</span>
          </h2>
          <div className={styles.tiles}>
            {CREATIONS.filter((c) => c.status === 'historic').map((c) => (
              <Tile key={c.slug} creation={c} number={String(c.index + 1).padStart(2, '0')}
                selected={selected?.slug === c.slug} onSelect={select} />
            ))}
          </div>
        </div>
      </aside>
    </section>
  );
};

export default Propager;
