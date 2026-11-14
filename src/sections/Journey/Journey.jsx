import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import styles from './Journey.module.css';
import { CANDIDATES, getCreation } from '../../constants/creations';
import { SOCIALS } from '../../constants/socials';
import { APP_TEASER } from '../../constants/site';
import { useVoteResults } from '../../context/VoteResultsContext';
import { resolveCreationStatus } from '../../utils/creationStatus';
import { computeStandings } from '../../utils/voteStats';
import { subscribe } from '../../services/newsletterService';
import ProgressGauge from '../../components/ProgressGauge/ProgressGauge';
import StatusBadge from '../../components/StatusBadge/StatusBadge';

/**
 * Suivez le chemin de l'amour — tableau de progression des votes (données Supabase réelles),
 * réseaux sociaux et newsletter.
 */

const DROP_BANNER = {
  preparing: { title: 'Le vote se prépare', text: "Les votes ne sont pas encore ouverts. Découvre les créations en lice ; les jauges s'animeront dès l'ouverture." },
  open: { title: 'Votes en cours', text: 'Résultats provisoires, calculés à partir des votes enregistrés et actualisés automatiquement. Rien n\'est joué tant que les votes sont ouverts.' },
  closed: { title: 'Votes clôturés', text: 'Merci pour votre participation ! Voici les résultats définitifs du vote. La création retenue sera annoncée officiellement par Love&Faith.' },
  announced: { title: 'La création retenue est connue', text: 'Merci à toutes celles et ceux qui ont voté. Rendez-vous sur nos réseaux pour la suite.' },
};

const names = (rows) => rows.map((r) => getCreation(r.slug).name).join(' et ');

/** Phrase de synthèse du classement — jamais un « gagnant » : seul drop_settings désigne la création retenue. */
function Summary({ voteStatus, rows, total }) {
  if (voteStatus === 'preparing') return null;
  if (total === 0) {
    return <p className={styles.summary}>{voteStatus === 'open' ? 'Aucun vote pour le moment : sois le premier à faire entendre ta voix.' : 'Aucun vote n\'a été enregistré.'}</p>;
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

function Leaderboard() {
  const results = useVoteResults();
  const ready = results.status === 'ready';
  const { refresh } = results;
  useEffect(() => { refresh(); }, [refresh]); // chiffres frais à l'arrivée sur la page (puis toutes les 45 s)

  const { total, rows } = useMemo(
    () => computeStandings(CANDIDATES.map((c) => ({ slug: c.slug, votes: ready ? results.bySlug[c.slug]?.votes ?? 0 : 0 }))),
    [results, ready],
  );

  if (!ready) {
    return (
      <div className={styles.unavailable} role="status">
        {results.status === 'loading'
          ? 'Chargement des résultats…'
          : 'Les résultats ne sont pas disponibles pour le moment. Ils apparaîtront ici dès l\'ouverture des votes.'}
      </div>
    );
  }

  const drop = results.drop;
  const voteStatus = drop?.voteStatus ?? 'preparing';
  const banner = DROP_BANNER[voteStatus] ?? DROP_BANNER.preparing;
  const winner = drop?.winnerSlug ? getCreation(drop.winnerSlug) : null;
  const showNumbers = voteStatus !== 'preparing'; // avant l'ouverture : aucun chiffre, aucun classement

  return (
    <>
      <div className={`${styles.banner} ${winner ? styles.bannerWinner : ''}`}>
        <p className={styles.bannerTitle}>{banner.title}</p>
        <p className={styles.bannerText}>{banner.text}</p>
        <Summary voteStatus={voteStatus} rows={rows} total={total} />
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

      <ol className={styles.board} aria-label={showNumbers ? 'Classement des créations candidates' : 'Créations candidates'}>
        {(showNumbers ? rows : CANDIDATES.map((c) => ({ slug: c.slug }))).map((row) => {
          const c = getCreation(row.slug);
          const status = resolveCreationStatus(c, results);
          return (
            <li key={`${row.slug}-${row.rank ?? 'unranked'}`} className={`${styles.row} ${status === 'winner' ? styles.rowWinner : ''} ${row.isLeader && ['open', 'closed'].includes(voteStatus) ? styles.rowLeader : ''}`}>
              <span className={styles.rank} aria-label={row.rank ? `Rang ${row.rank}${row.tied ? ' (ex æquo)' : ''}` : 'Pas encore classé'}>
                {row.rank ? String(row.rank).padStart(2, '0') : '—'}
                {row.tied && <small>ex æquo</small>}
              </span>
              <Link to={`/propager/${c.slug}`} className={styles.identity}>
                <img src={c.icon} alt="" className={styles.icon} loading="lazy" />
                <img src={c.mockups.front} alt="" className={styles.mockup} loading="lazy" />
                <span className={styles.names}>
                  <strong>{c.name}</strong>
                  <StatusBadge status={status} />
                </span>
              </Link>
              <div className={styles.gauge}>
                {showNumbers ? (
                  <>
                    <ProgressGauge share={row.share} votes={row.votes} label={c.name} highlight={status === 'winner'} />
                    {row.isLeader && voteStatus === 'open' && (
                      <span className={styles.leader}>{row.tied ? 'En tête à égalité' : 'En tête'} · provisoire</span>
                    )}
                    {row.isLeader && voteStatus === 'closed' && (
                      <span className={styles.leader}>{row.tied ? 'Égalité en tête' : 'En tête du vote'} · résultat final</span>
                    )}
                  </>
                ) : (
                  <Link to={`/propager/${c.slug}`} className={styles.discover}>Découvrir cette création →</Link>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {showNumbers && (
        <p className={styles.footnote}>
          {total} vote{total > 1 ? 's' : ''} exprimé{total > 1 ? 's' : ''}. Le pourcentage est la <strong>part des votes exprimés</strong> :
          votes de la création ÷ total des votes × 100 — ce n'est pas une probabilité de gagner. Une même personne pouvant voter pour
          plusieurs créations, le total des votes n'est pas un nombre de personnes. La création retenue est désignée officiellement
          par Love&amp;Faith à la clôture.
          {results.stale && ' (Connexion instable : derniers chiffres connus affichés.)'}
        </p>
      )}
    </>
  );
}

function Newsletter() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState('idle'); // idle | sending | done | error

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!email || state === 'sending') return;
    setState('sending');
    try {
      await subscribe(email);
      setState('done');
    } catch {
      setState('error');
    }
  };

  return (
    <div className={styles.newsletter}>
      <h3 className={styles.cardTitle}>Une application arrive</h3>
      <p className={styles.cardText}>{APP_TEASER}</p>
      {state === 'done' ? (
        <p className={styles.success} role="status">✓ Tu fais maintenant partie de l'aventure.</p>
      ) : (
        <form className={styles.emailForm} onSubmit={onSubmit}>
          <label htmlFor="newsletter-email" className="sr-only">Adresse e-mail</label>
          <input
            id="newsletter-email"
            type="email"
            className={styles.emailInput}
            placeholder="ton@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
          <button type="submit" className={styles.emailBtn} disabled={state === 'sending'}>
            {state === 'sending' ? '…' : 'Rejoindre'}
          </button>
        </form>
      )}
      {state === 'error' && (
        <p className={styles.error} role="alert">Une erreur est survenue. Réessaie ou contacte-nous sur Instagram.</p>
      )}
    </div>
  );
}

const Journey = () => (
  <section className={styles.journey} aria-labelledby="journey-title">
    <header className={styles.head}>
      <p className={styles.kicker}>Suivez le chemin de l'amour</p>
      <h1 id="journey-title" className={styles.title}>Le chemin de l'amour</h1>
      <p className={styles.lead}>
        La communauté choisit le prochain T-shirt Love&amp;Faith. Un seul modèle sera retenu,
        pour que nous puissions tous porter la même création — et les mêmes valeurs.
      </p>
    </header>

    <Leaderboard />

    <div className={styles.community}>
      <div className={styles.socialCard}>
        <h2 className={styles.cardTitle}>Rejoins la communauté</h2>
        <p className={styles.cardText}>
          Suis nos réseaux pour connaître l'évolution des votes, leur clôture, la création retenue,
          le début des précommandes et les prochaines étapes du projet.
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
      <Newsletter />
    </div>
  </section>
);

export default Journey;
