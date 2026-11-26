import { useCallback, useEffect, useState } from 'react';
import styles from './Admin.module.css';
import { BarList, TimeChart, formatNumber } from './Charts';
import { CREATIONS } from '../../constants/creations';
import {
  AdminError, checkIsAdmin, fetchDashboard, getSession, isAuthAvailable, onAuthChange, signIn, signOut,
} from '../../services/adminService';

const PERIODS = [
  { id: 'today', label: "Aujourd'hui", prev: 'hier' },
  { id: '7d', label: '7 jours', prev: '7 jours précédents' },
  { id: '30d', label: '30 jours', prev: '30 jours précédents' },
  { id: '90d', label: '90 jours', prev: '90 jours précédents' },
  { id: 'all', label: 'Depuis le lancement', prev: null },
];

const PAGE_NAMES = {
  propager: "Propager l'amour",
  'a-propos': "À propos de l'amour",
  chemin: "Suivez le chemin de l'amour",
  jouer: "Jouer avec l'amour",
  son: "Le son de l'amour",
  confidentialite: 'Politique de confidentialité',
  'mentions-legales': 'Mentions légales',
};
const pageName = (key) => {
  if (key?.startsWith('creation:')) {
    const slug = key.slice(9);
    return `Création — ${CREATIONS.find((c) => c.slug === slug)?.name ?? slug}`;
  }
  return PAGE_NAMES[key] ?? key;
};

const formatDuration = (seconds) => {
  const s = Math.round(Number(seconds) || 0);
  if (s < 60) return `${s} s`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min ${String(s % 60).padStart(2, '0')} s`;
};
const pct = (a, b) => (b ? `${Math.round((a / b) * 100)} %` : '—');

function Kpi({ label, value, prev, hint, format = formatNumber, prevLabel }) {
  const delta = prev === undefined || prev === null ? null : Number(value) - Number(prev);
  return (
    <div className={styles.kpi}>
      <p className={styles.kpiLabel}>{label}</p>
      <p className={styles.kpiValue}>{format(value)}</p>
      {delta !== null && prevLabel && (
        <p className={`${styles.kpiDelta} ${delta > 0 ? styles.up : delta < 0 ? styles.down : ''}`}>
          <span aria-hidden="true">{delta > 0 ? '▲' : delta < 0 ? '▼' : '='}</span>{' '}
          {delta === 0 ? 'stable' : `${delta > 0 ? '+' : '−'}${format(Math.abs(delta))}`} vs {prevLabel}
        </p>
      )}
      {hint && <p className={styles.kpiHint}>{hint}</p>}
    </div>
  );
}

function Section({ title, kicker, children, note }) {
  return (
    <section className={styles.section}>
      <header className={styles.sectionHead}>
        {kicker && <p className={styles.kicker}>{kicker}</p>}
        <h2 className={styles.sectionTitle}>{title}</h2>
        {note && <p className={styles.note}>{note}</p>}
      </header>
      {children}
    </section>
  );
}

function Dashboard({ email, onSignOut }) {
  const [period, setPeriod] = useState('30d');
  const [traffic, setTraffic] = useState('visitors');
  const [state, setState] = useState({ status: 'loading', data: null, error: null });

  const load = useCallback(async (p) => {
    setState((s) => ({ ...s, status: 'loading' }));
    try {
      setState({ status: 'ready', data: await fetchDashboard(p), error: null });
    } catch (err) {
      setState({ status: 'error', data: null, error: err instanceof AdminError ? err : new AdminError('network', 'Erreur.') });
    }
  }, []);
  useEffect(() => { load(period); }, [period, load]);

  const d = state.data;
  const per = PERIODS.find((p) => p.id === period);
  const t = d?.totals ?? {};
  const pv = d?.previous ?? null;
  const prevLabel = pv ? per.prev : null;
  const music = d?.music;
  const game = d?.game;
  const totalViews = (d?.pages ?? []).reduce((a, p) => a + Number(p.views), 0);

  return (
    <div className={styles.dash}>
      <header className={styles.top}>
        <div>
          <p className={styles.kicker}>Love&amp;Faith · Espace privé</p>
          <h1 className={styles.title}>Tableau de bord</h1>
          {d && <p className={styles.range}>
            Du {new Date(d.from).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: period === 'today' ? 'short' : undefined })} au {new Date(d.to).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}
          </p>}
        </div>
        <div className={styles.account}>
          <span className={styles.email}>{email}</span>
          <button type="button" className={styles.ghost} onClick={() => load(period)}>Actualiser</button>
          <button type="button" className={styles.ghost} onClick={onSignOut}>Déconnexion</button>
        </div>
      </header>

      <div className={styles.periods} role="group" aria-label="Période d'analyse">
        {PERIODS.map((p) => (
          <button key={p.id} type="button" className={`${styles.period} ${p.id === period ? styles.periodOn : ''}`}
            aria-pressed={p.id === period} onClick={() => setPeriod(p.id)}>{p.label}</button>
        ))}
      </div>

      {state.status === 'error' && (
        <p className={styles.alert} role="alert">{state.error.message}</p>
      )}
      {!d && state.status === 'loading' && <p className={styles.loading} role="status">Chargement des statistiques…</p>}

      {d && (
        <div className={`${styles.content} ${state.status === 'loading' ? styles.stale : ''}`} aria-busy={state.status === 'loading'}>
          <Section title="Vue générale" kicker="Statistiques principales"
            note="Visiteurs uniques : appareils distincts sur la période. Visiteurs : visiteurs uniques comptés chaque jour puis additionnés. Session : une visite (nouvelle après 30 min d'inactivité). Pages vues : chaque page affichée.">
            <div className={styles.kpis}>
              <Kpi label="Visiteurs (cumul journalier)" value={t.daily_visitors} prev={pv?.daily_visitors} prevLabel={prevLabel} />
              <Kpi label="Visiteurs uniques" value={t.unique_visitors} prev={pv?.unique_visitors} prevLabel={prevLabel} />
              <Kpi label="Pages vues" value={t.page_views} prev={pv?.page_views} prevLabel={prevLabel} />
              <Kpi label="Sessions" value={t.sessions} prev={pv?.sessions} prevLabel={prevLabel} />
              <Kpi label="Joueurs 51 Wheeling" value={t.game_players} prev={pv?.game_players} prevLabel={prevLabel}
                hint={`${formatNumber(t.game_openers)} visiteur(s) ont ouvert le jeu`} />
              <Kpi label="Lectures musicales" value={t.music_plays} prev={pv?.music_plays} prevLabel={prevLabel} />
              <Kpi label="Votes" value={t.votes} prev={pv?.votes} prevLabel={prevLabel} hint={`${formatNumber(d.all_time.votes)} au total`} />
              <Kpi label="Inscriptions newsletter" value={t.newsletter_new} prev={pv?.newsletter_new} prevLabel={prevLabel}
                hint={`${formatNumber(d.all_time.newsletter_subscribed)} inscrits actifs`} />
              <Kpi label="Précommandes" value={t.preorders_new} prev={pv?.preorders_new} prevLabel={prevLabel}
                hint={`${formatNumber(d.all_time.preorders)} au total`} />
            </div>
          </Section>

          <Section title="Fréquentation" kicker="Évolution des visites">
            <div className={styles.tabs} role="group" aria-label="Mesure affichée">
              {[['visitors', 'Visiteurs'], ['sessions', 'Sessions'], ['page_views', 'Pages vues']].map(([k, l]) => (
                <button key={k} type="button" className={`${styles.tab} ${traffic === k ? styles.tabOn : ''}`} aria-pressed={traffic === k}
                  onClick={() => setTraffic(k)}>{l}</button>
              ))}
            </div>
            <TimeChart series={d.series} field={traffic} bucket={d.bucket}
              label={{ visitors: 'Visiteurs', sessions: 'Sessions', page_views: 'Pages vues' }[traffic]} />
          </Section>

          <Section title="Les pages les plus visitées" kicker="Analyse des pages">
            {d.pages.length === 0 ? <p className={styles.empty}>Aucune page vue sur cette période.</p> : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead><tr><th>Page</th><th>Visiteurs</th><th>Vues</th><th>Temps moyen</th><th>Part des vues</th></tr></thead>
                  <tbody>
                    {d.pages.map((p) => (
                      <tr key={p.page_key}>
                        <td>{pageName(p.page_key)}</td>
                        <td>{formatNumber(p.visitors)}</td>
                        <td>{formatNumber(p.views)}</td>
                        <td>{p.avg_seconds === null ? '—' : formatDuration(p.avg_seconds)}</td>
                        <td>
                          <span className={styles.share}>
                            <span className={styles.shareBar}><span style={{ width: `${(p.views / totalViews) * 100}%` }} /></span>
                            {pct(p.views, totalViews)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <Section title="Activité — Jouer avec l'amour" kicker="51 Wheeling"
            note="Le bouton « Jouer » se trouve dans le jeu, sur 51games.fr : ses clics ne sont pas visibles depuis Love&Faith. « Jeu prêt » et « parties terminées » proviennent des événements ready et run_end envoyés par 51 Wheeling, uniquement s'ils sont reçus.">
            <div className={styles.kpis}>
              <Kpi label="Visiteurs de la page du jeu" value={game.page_visitors} hint={`${formatNumber(game.page_views)} vues`} />
              <Kpi label="Sessions de jeu ouvertes" value={game.sessions} hint={`${formatNumber(game.opens)} chargements du jeu`} />
              <Kpi label="Jeu prêt (événement ready)" value={game.ready} hint={`${formatNumber(game.players)} joueur(s) distinct(s)`} />
              <Kpi label="Plein écran" value={game.fullscreen} />
              <Kpi label="Clics vers 51Games.fr" value={game.external} />
              <Kpi label="Parties terminées (run_end)" value={game.run_ends}
                hint={game.best_score !== null ? `Meilleur score ${formatNumber(game.best_score)} · moyenne ${formatNumber(game.avg_score)}` : 'Aucun score reçu'} />
            </div>
            <div className={styles.twoCols}>
              <TimeChart series={d.series} field="game_sessions" bucket={d.bucket} label="Sessions de jeu" />
              <div className={styles.chart}>
                <p className={styles.chartCaption}><span>Appareils (sessions de jeu)</span></p>
                <BarList items={['mobile', 'tablet', 'desktop', 'inconnu'].filter((k) => game.devices[k] !== undefined || k !== 'inconnu').map((k) => ({
                  key: k, label: { mobile: 'Téléphone', tablet: 'Tablette', desktop: 'Ordinateur', inconnu: 'Inconnu' }[k], value: game.devices[k] ?? 0,
                  sub: pct(game.devices[k] ?? 0, Object.values(game.devices).reduce((a, b) => a + Number(b), 0)),
                }))} />
              </div>
            </div>
          </Section>

          <Section title="Le son de l'amour — Statistiques musicales" kicker="Musique"
            note="Lecture : premier démarrage effectif d'un morceau. Écoute significative : 30 s réellement écoutées (ou la moitié d'un morceau plus court). Terminé : écouté jusqu'à la fin.">
            <div className={styles.kpis}>
              <Kpi label="Lectures" value={music.starts} />
              <Kpi label="Écoutes significatives" value={music.listens} hint={pct(music.listens, music.starts)} />
              <Kpi label="Morceaux terminés" value={music.completes} hint={`Taux ${pct(music.completes, music.starts)}`} />
              <Kpi label="Temps d'écoute cumulé" value={music.seconds} format={formatDuration} />
              <Kpi label="Durée moyenne d'écoute" value={music.starts ? music.seconds / music.starts : 0} format={formatDuration} />
              <Kpi label="Pauses" value={music.pauses} />
              <Kpi label="Changements de morceau" value={music.skips} />
            </div>
            <div className={styles.twoCols}>
              <div className={styles.chart}>
                <p className={styles.chartCaption}><span>Top des morceaux les plus écoutés</span></p>
                <BarList items={music.tracks.filter((m) => Number(m.starts) > 0).map((m) => ({
                  key: m.id, label: `${m.artist} — ${m.title}`, value: m.starts,
                  sub: `${formatNumber(m.listens)} écoute(s) significative(s) · ${formatNumber(m.completes)} terminé(s) · ${formatDuration(m.seconds)}`,
                }))} empty="Aucune lecture sur cette période." />
              </div>
              <div className={styles.chart}>
                <p className={styles.chartCaption}><span>Lectures par artiste</span></p>
                <BarList items={music.artists.map((a) => ({ key: a.artist, label: a.artist, value: a.starts, sub: formatDuration(a.seconds) }))}
                  empty="Aucune lecture sur cette période." />
              </div>
            </div>
            <TimeChart series={d.series} field="music_plays" bucket={d.bucket} label="Lectures" />
          </Section>

          <Section title="Le chemin de l'amour — Votes" kicker="Votes (table drop_votes)">
            <div className={styles.kpis}>
              <Kpi label="Votes sur la période" value={t.votes} prev={pv?.votes} prevLabel={prevLabel} />
              <Kpi label="Votes au total" value={d.all_time.votes} />
              <Kpi label="Créations ayant reçu des votes" value={d.all_time.creations_with_votes} />
            </div>
            <div className={styles.twoCols}>
              <div className={styles.chart}>
                <p className={styles.chartCaption}><span>Classement des créations (période)</span></p>
                <BarList items={d.votes.map((v) => ({ key: v.slug, label: v.name, value: v.votes }))} empty="Aucun vote sur cette période." />
              </div>
              <TimeChart series={d.series} field="votes" bucket={d.bucket} label="Votes" />
            </div>
          </Section>

          <Section title="Précommandes et newsletter" kicker="Inscriptions"
            note="Aucune adresse e-mail ni donnée personnelle n'est affichée : uniquement des nombres.">
            <div className={styles.kpis}>
              <Kpi label="Précommandes (période)" value={t.preorders_new} prev={pv?.preorders_new} prevLabel={prevLabel} />
              <Kpi label="Précommandes au total" value={d.all_time.preorders} />
              <Kpi label="Nouveaux inscrits newsletter" value={t.newsletter_new} prev={pv?.newsletter_new} prevLabel={prevLabel} />
              <Kpi label="Inscrits actifs" value={d.all_time.newsletter_subscribed} />
              <Kpi label="Désinscriptions (total)" value={d.all_time.newsletter_unsubscribed}
                hint={`${formatNumber(d.series.reduce((a, p) => a + Number(p.newsletter_unsub), 0))} sur la période`} />
            </div>
            <div className={styles.twoCols}>
              <TimeChart series={d.series} field="preorders" bucket={d.bucket} label="Précommandes" />
              <TimeChart series={d.series} field="newsletter_new" bucket={d.bucket} label="Inscriptions newsletter" />
            </div>
            <div className={styles.twoCols}>
              <div className={styles.chart}>
                <p className={styles.chartCaption}><span>Précommandes par drop (total)</span></p>
                <BarList items={d.preorders.by_drop.map((x) => ({ key: x.slug, label: x.name, value: x.people }))} empty="Aucune précommande." />
              </div>
              <div className={styles.chart}>
                <p className={styles.chartCaption}><span>Statut des précommandes (total)</span></p>
                <BarList items={Object.entries(d.preorders.by_status).map(([k, v]) => ({
                  key: k, label: { interested: 'Intéressé·e', cancelled: 'Annulée', converted: 'Convertie' }[k] ?? k, value: v,
                }))} empty="Aucune précommande." />
              </div>
            </div>
          </Section>
        </div>
      )}
    </div>
  );
}

function Login({ onDone }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [state, setState] = useState({ sending: false, error: '' });
  const submit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password) { setState({ sending: false, error: 'Renseigne ton e-mail et ton mot de passe.' }); return; }
    setState({ sending: true, error: '' });
    const res = await signIn(email, password);
    setState({ sending: false, error: res.ok ? '' : res.message });
    if (res.ok) onDone?.();
  };
  return (
    <form className={styles.login} onSubmit={submit} noValidate>
      <p className={styles.kicker}>Love&amp;Faith · Espace privé</p>
      <h1 className={styles.title}>Connexion administrateur</h1>
      <label className={styles.field}>
        <span>E-mail</span>
        <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </label>
      <label className={styles.field}>
        <span>Mot de passe</span>
        <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </label>
      {state.error && <p className={styles.alert} role="alert">{state.error}</p>}
      <button type="submit" className={styles.primary} disabled={state.sending}>{state.sending ? 'Connexion…' : 'Se connecter'}</button>
    </form>
  );
}

/** /admin — réservé au compte administrateur (vérification dans Supabase, jamais seulement dans le navigateur). */
const Admin = () => {
  const [auth, setAuth] = useState({ status: 'checking', session: null, admin: null });

  const evaluate = useCallback(async (session) => {
    if (!session) { setAuth({ status: 'login', session: null, admin: null }); return; }
    setAuth({ status: 'checking', session, admin: null });
    const admin = await checkIsAdmin();
    setAuth({ status: admin ? 'admin' : admin === false ? 'forbidden' : 'error', session, admin });
  }, []);

  useEffect(() => {
    if (!isAuthAvailable()) { setAuth({ status: 'error', session: null, admin: null }); return undefined; }
    getSession().then(evaluate);
    return onAuthChange((session) => evaluate(session));
  }, [evaluate]);

  const logout = useCallback(async () => { await signOut(); setAuth({ status: 'login', session: null, admin: null }); }, []);

  return (
    <div className={styles.page}>
      {auth.status === 'checking' && <p className={styles.loading} role="status">Vérification de l'accès…</p>}
      {auth.status === 'login' && <Login />}
      {auth.status === 'forbidden' && (
        <div className={styles.login} role="alert">
          <p className={styles.kicker}>Erreur 403</p>
          <h1 className={styles.title}>Accès refusé</h1>
          <p>Ce compte n'a pas accès à l'espace administrateur Love&amp;Faith.</p>
          <button type="button" className={styles.primary} onClick={logout}>Se déconnecter</button>
        </div>
      )}
      {auth.status === 'error' && (
        <div className={styles.login} role="alert">
          <h1 className={styles.title}>Espace indisponible</h1>
          <p>Impossible de vérifier l'accès pour le moment (service injoignable ou configuration incomplète).</p>
          {auth.session && <button type="button" className={styles.primary} onClick={logout}>Se déconnecter</button>}
        </div>
      )}
      {auth.status === 'admin' && <Dashboard email={auth.session?.user?.email} onSignOut={logout} />}
    </div>
  );
};

export default Admin;
