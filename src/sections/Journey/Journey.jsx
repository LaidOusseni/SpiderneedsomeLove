import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import styles from './Journey.module.css';
import { CANDIDATES, getCreation } from '../../constants/creations';
import { SOCIALS } from '../../constants/socials';
import { useVoteResults } from '../../context/VoteResultsContext';
import { canVote, resolveCreationStatus } from '../../utils/creationStatus';
import { computeStandings, formatShare } from '../../utils/voteStats';
import { fetchVoteTotals } from '../../services/voteService';
import { fetchPreorderCount } from '../../services/preorderService';
import StatusBadge from '../../components/StatusBadge/StatusBadge';
import NewsletterSignup from '../../components/NewsletterSignup/NewsletterSignup';

/**
 * Le chemin de l'amour — classement réel des créations candidates (Supabase), prochaines étapes, communauté, newsletter.
 * Classement : vue `drop_vote_totals` (votes comptés depuis les votes individuels, rang calculé en base).
 * Si la vue n'est pas encore déployée, repli sur les compteurs de get_drop_overview — jamais de chiffres fictifs.
 */

const POLL_MS = 20000; // actualisation du classement tant que la page est visible
const PREORDER_DROP_SLUG = 'batman-drop-01';

const DROP_BANNER = {
  preparing: { title: 'Le vote se prépare', text: "Les votes ne sont pas encore ouverts. Découvre les créations en lice : le classement s'affichera dès l'ouverture." },
  open: { title: 'Votes en cours', text: "Classement en direct, calculé à partir des votes enregistrés. Rien n'est joué tant que les votes sont ouverts." },
  closed: { title: 'Votes clôturés', text: 'Merci pour votre participation ! Voici le classement final. La création retenue sera annoncée officiellement par Love&Faith.' },
  announced: { title: 'La création retenue est connue', text: 'Merci à toutes celles et ceux qui ont voté. Le classement reste consultable ci-dessous.' },
};

const NEXT_STEPS = [
  { title: 'Le vote', text: 'Chaque création candidate reçoit vos voix. Les votes restent ouverts jusqu\'à leur fermeture, annoncée sur nos réseaux.' },
  { title: 'La sélection', text: 'À la clôture, Love&Faith annonce officiellement la création retenue pour devenir le prochain drop.' },
  { title: 'Les précommandes', text: 'La création retenue ouvre ses précommandes, comme le drop actuel. Une seule pièce, portée par toute la communauté.' },
  { title: 'La suite', text: "Nouvelles pièces, accessoires et collections : chaque étape sera partagée en avant-première dans nos lettres d'amour." },
];

const names = (rows) => rows.map((r) => getCreation(r.slug)?.name ?? r.name).join(' et ');

/** Phrase de synthèse — jamais un « gagnant » : seul drop_settings désigne la création retenue. */
function Summary({ voteStatus, rows, total }) {
  if (voteStatus === 'preparing') return null;
  if (total === 0) {
    return <p className={styles.summary}>{voteStatus === 'open' ? 'Aucun vote pour le moment : sois le premier à faire entendre ta voix.' : "Aucun vote n'a été enregistré."}</p>;
  }
  const leaders = rows.filter((r) => r.isLeader);
  const tie = leaders.length > 1;
  if (voteStatus === 'open') {
    return (
      <p className={styles.summary}>
        {tie ? <>Égalité en tête entre <strong>{names(leaders)}</strong>.</> : <><strong>{names(leaders)}</strong> est en tête pour le moment.</>}
      </p>
    );
  }
  if (voteStatus === 'closed') {
    return (
      <p className={styles.summary}>
        {tie
          ? <>Égalité en tête entre <strong>{names(leaders)}</strong> : Love&amp;Faith annoncera comment elles seront départagées.</>
          : <><strong>{names(leaders)}</strong> termine en tête du vote. La création retenue sera confirmée officiellement.</>}
      </p>
    );
  }
  return null;
}

/**
 * Classement depuis la vue drop_vote_totals ; actualisé toutes les 20 s (onglet visible), au retour sur l'onglet
 * et dès qu'un vote est enregistré sur le site (les compteurs du contexte changent).
 */
function useLeaderboard(results) {
  const [state, setState] = useState({ status: 'loading', rows: [] });
  const busy = useRef(false);

  const load = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const rows = await fetchVoteTotals();
      setState({ status: 'ready', rows, source: 'view' });
    } catch (err) {
      setState((prev) => (prev.status === 'ready' && err.code === 'network'
        ? { ...prev, stale: true }
        : { status: err.code === 'unavailable' ? 'unavailable' : 'error', rows: [] }));
    } finally {
      busy.current = false;
    }
  }, []);

  useEffect(() => {
    load();
    const tick = () => document.visibilityState === 'visible' && load();
    const id = setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [load]);

  // Un vote enregistré ailleurs sur le site met à jour le contexte : on resynchronise le classement
  const signature = useMemo(
    () => CANDIDATES.map((c) => results.bySlug?.[c.slug]?.votes ?? 0).join(','),
    [results.bySlug],
  );
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    load();
  }, [signature, load]);

  return state;
}

function PreorderInterest() {
  const [state, setState] = useState({ count: null, status: 'loading', stale: false });

  useEffect(() => {
    let active = true;
    let busy = false;
    const load = async () => {
      if (busy) return;
      busy = true;
      try {
        const result = await fetchPreorderCount(PREORDER_DROP_SLUG);
        if (!active) return;
        if (result.source === 'unavailable') {
          setState({ count: null, status: 'unavailable', stale: false });
        } else if (result.source === 'supabase' && Number.isInteger(result.count) && result.count >= 0) {
          setState({ count: result.count, status: 'ready', stale: false });
        } else {
          throw new Error('Supabase returned an invalid preorder count.');
        }
      } catch {
        if (active) {
          setState((previous) => previous.status === 'ready'
            ? { ...previous, stale: true }
            : { count: null, status: 'error', stale: false });
        }
      } finally {
        busy = false;
      }
    };
    const tick = () => document.visibilityState === 'visible' && load();

    load();
    const timer = setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, []);

  return (
    <section className={styles.preorderCounter} aria-labelledby="preorder-interest-title">
      <div className={styles.preorderIntro}>
        <p className={styles.preorderKicker}>Drop actuel · Précommandes</p>
        <h2 id="preorder-interest-title" className={styles.preorderTitle}>Love in Darkness</h2>
        <p className={styles.preorderNote}>Compteur basé sur les inscriptions enregistrées dans Supabase.</p>
      </div>
      <div className={styles.preorderResult} aria-live="polite" aria-busy={state.status === 'loading'}>
        {state.count === null ? (
          <p className={styles.preorderMessage} role="status">
            {state.status === 'loading'
              ? 'Chargement du nombre de personnes…'
              : 'Le nombre d’inscriptions est momentanément indisponible.'}
          </p>
        ) : (
          <p className={styles.preorderStatement}>
            <strong id="preorder-interest-count" className={styles.preorderNumber}>{state.count}</strong>
            <span>personne{state.count === 1 ? '' : 's'} {state.count === 1 ? 'veut' : 'veulent'} propager l’amour</span>
          </p>
        )}
        {state.stale && <p className={styles.preorderMessage}>Dernier nombre connu affiché, actualisation momentanément indisponible.</p>}
      </div>
    </section>
  );
}

/** Animation FLIP : quand le classement change, chaque ligne glisse de son ancienne place vers la nouvelle. */
function useFlip(keys) {
  const nodes = useRef(new Map());
  const last = useRef(new Map());
  useLayoutEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    nodes.current.forEach((el, key) => {
      const top = el.offsetTop; // relatif au tableau : insensible au défilement de la page
      const prev = last.current.get(key);
      if (!reduce && prev !== undefined && Math.abs(prev - top) > 1 && el.animate) {
        el.animate(
          [{ transform: `translateY(${prev - top}px)` }, { transform: 'translateY(0)' }],
          { duration: 600, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
        );
      }
      last.current.set(key, top);
    });
  }, [keys]);
  return useCallback((key) => (el) => {
    if (el) nodes.current.set(key, el);
    else nodes.current.delete(key);
  }, []);
}

function Scoreboard() {
  const results = useVoteResults();
  const board = useLeaderboard(results);
  const { refresh } = results;
  useEffect(() => { refresh(); }, [refresh]);

  const voteStatus = results.drop?.voteStatus ?? (board.status === 'ready' ? 'open' : 'preparing');
  const banner = DROP_BANNER[voteStatus] ?? DROP_BANNER.preparing;
  const winner = results.drop?.winnerSlug ? getCreation(results.drop.winnerSlug) : null;

  // Lignes : vue SQL (rang calculé en base) ; sinon compteurs de get_drop_overview
  const { rows, total, source } = useMemo(() => {
    if (board.status === 'ready') {
      const known = board.rows.filter((r) => getCreation(r.slug));
      const sum = known.reduce((s, r) => s + r.votes, 0);
      const max = known.reduce((m, r) => Math.max(m, r.votes), 0);
      return {
        total: sum,
        source: 'view',
        rows: known.map((r) => ({
          slug: r.slug,
          votes: r.votes,
          rank: sum > 0 ? r.rank : null,
          share: sum > 0 ? (r.votes / sum) * 100 : 0,
          isLeader: max > 0 && r.votes === max,
          tied: sum > 0 && r.votes > 0 && known.filter((o) => o.votes === r.votes).length > 1,
        })),
      };
    }
    if (results.status === 'ready') {
      const s = computeStandings(CANDIDATES.map((c) => ({ slug: c.slug, votes: results.bySlug[c.slug]?.votes ?? 0 })));
      return { ...s, source: 'overview' };
    }
    return { rows: [], total: 0, source: null };
  }, [board, results]);

  const max = rows.reduce((m, r) => Math.max(m, r.votes), 0);
  const order = rows.map((r) => r.slug).join('|');
  const flipRef = useFlip(order);

  if (!source) {
    return (
      <div className={styles.unavailable} role="status">
        {board.status === 'loading' || results.status === 'loading'
          ? 'Chargement du classement…'
          : 'Le classement est momentanément injoignable. Réessaie dans quelques instants.'}
      </div>
    );
  }

  const showNumbers = voteStatus !== 'preparing';

  return (
    <>
      <div className={`${styles.banner} ${winner ? styles.bannerWinner : ''}`}>
        <span className={`${styles.live} ${voteStatus === 'open' ? styles.liveOn : ''}`} aria-hidden="true" />
        <div className={styles.bannerBody}>
          <p className={styles.bannerTitle}>{banner.title}</p>
          <p className={styles.bannerText}>{banner.text}</p>
          {showNumbers && <Summary voteStatus={voteStatus} rows={rows} total={total} />}
        </div>
        {winner && (
          <Link to={`/propager/${winner.slug}`} className={styles.winner}>
            <img src={winner.icon} alt="" />
            <span>
              <small>Création officiellement retenue</small>
              <strong>{winner.name}</strong>
            </span>
          </Link>
        )}
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <caption className="sr-only">
            Classement des créations candidates au prochain drop{showNumbers ? `, ${total} votes au total` : ''}
          </caption>
          <thead>
            <tr>
              <th scope="col" className={styles.colRank}>Classement</th>
              <th scope="col" className={styles.colName}>Création</th>
              <th scope="col" className={styles.colLogo}>Logo</th>
              <th scope="col" className={styles.colVotes}>Nombre de votes</th>
            </tr>
          </thead>
          <tbody>
            {(showNumbers ? rows : CANDIDATES.map((c) => ({ slug: c.slug }))).map((row, i) => {
              const c = getCreation(row.slug);
              const status = resolveCreationStatus(c, results);
              const first = showNumbers && row.isLeader && total > 0;
              const pct = max > 0 ? (row.votes / max) * 100 : 0;
              return (
                <tr key={row.slug} ref={flipRef(row.slug)}
                  className={`${styles.row} ${first ? styles.rowFirst : ''} ${status === 'winner' ? styles.rowWinner : ''}`}
                  style={{ '--i': i }}>
                  <td className={styles.colRank}>
                    <span className={styles.rank}>
                      {showNumbers && row.rank ? String(row.rank).padStart(2, '0') : '—'}
                    </span>
                    {row.tied && <small className={styles.tie}>ex æquo</small>}
                    {first && <span className={styles.crown} aria-label="En tête">♛</span>}
                  </td>
                  <td className={styles.colName}>
                    <Link to={`/propager/${c.slug}`} className={styles.nameLink}>
                      <strong>{c.name}</strong>
                      {c.subtitle && <span className={styles.sub}>{c.subtitle}</span>}
                    </Link>
                    <StatusBadge status={status} />
                  </td>
                  <td className={styles.colLogo}>
                    <Link to={`/propager/${c.slug}`} tabIndex={-1} aria-hidden="true" className={styles.thumbs}>
                      <img src={c.icon} alt="" className={styles.icon} loading="lazy" width="52" height="52" />
                      <img src={c.mockups.front} alt="" className={styles.mockup} loading="lazy" />
                    </Link>
                  </td>
                  <td className={styles.colVotes}>
                    {showNumbers ? (
                      <div className={styles.score}>
                        <p className={styles.count}>
                          <strong>{row.votes}</strong> vote{row.votes > 1 ? 's' : ''}
                          <span className={styles.share}>{formatShare(row.share)}</span>
                        </p>
                        <span className={styles.bar} role="presentation">
                          <span className={styles.barFill} style={{ width: `${pct}%` }} />
                        </span>
                      </div>
                    ) : (
                      <Link to={`/propager/${c.slug}`} className={styles.discover}>Découvrir →</Link>
                    )}
                    {canVote(c, results) && (
                      <Link to={`/propager/${c.slug}?voter=1`} className={styles.voteLink}>Voter</Link>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showNumbers && (
        <p className={styles.footnote}>
          <strong>{total} vote{total > 1 ? 's' : ''}</strong> enregistré{total > 1 ? 's' : ''}. Les barres sont proportionnelles
          au nombre de votes (la création en tête remplit la barre) ; le pourcentage est la part des votes exprimés.
          Une même personne pouvant soutenir plusieurs créations, le total n'est pas un nombre de personnes.
          Batman (drop actuel) et Masks &amp; Hearts (ancien drop) ne participent pas au vote.
          {(board.stale || results.stale) && ' (Connexion instable : derniers chiffres connus affichés.)'}
        </p>
      )}
    </>
  );
}

const Journey = () => (
  <section className={styles.journey} aria-labelledby="journey-title">
    <header className={styles.head}>
      <p className={styles.kicker}>Suivez le chemin de l'amour</p>
      <h1 id="journey-title" className={styles.title}>Le chemin de l'amour</h1>
      <p className={styles.lead}>
        Love&amp;Faith se construit avec sa communauté. Ensemble, nous choisissons la prochaine pièce de la marque :
        une seule création sera retenue, pour que nous puissions tous porter les mêmes valeurs.
      </p>
    </header>

    <PreorderInterest />

    <section className={styles.scores} aria-labelledby="scores-title">
      <h2 id="scores-title" className={styles.sectionTitle}>Le classement des prochains drops</h2>
      <Scoreboard />
    </section>

    <section className={styles.steps} aria-labelledby="steps-title">
      <h2 id="steps-title" className={styles.sectionTitle}>Les prochaines étapes</h2>
      <ol className={styles.stepList}>
        {NEXT_STEPS.map((s, i) => (
          <li key={s.title} className={styles.step}>
            <span className={styles.stepNum} aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
            <h3 className={styles.stepTitle}>{s.title}</h3>
            <p className={styles.stepText}>{s.text}</p>
          </li>
        ))}
      </ol>
    </section>

    <div className={styles.community}>
      <div id="communaute" className={styles.socialCard}>
        <h2 className={styles.cardTitle}>Rejoins la communauté</h2>
        <p className={styles.cardText}>
          Une question, une idée, une envie de collaborer ? Écris-nous sur nos réseaux. Tu y suivras aussi l'évolution
          des votes, leur clôture, la création retenue et les prochaines étapes du projet.
        </p>
        <ul className={styles.socials}>
          {SOCIALS.map((s) => (
            <li key={s.id}>
              <a href={s.url} target="_blank" rel="noopener noreferrer" className={styles.social}>
                <span className={styles.socialLabel}>{s.label}</span>
                <span className={styles.socialHandle}>{s.handle}</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
      <NewsletterSignup id="newsletter" />
    </div>
  </section>
);

export default Journey;
