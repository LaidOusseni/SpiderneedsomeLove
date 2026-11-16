import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import styles from '../Privacy/Privacy.module.css';
import { unsubscribe } from '../../services/newsletterService';

/**
 * Désinscription de la newsletter : /newsletter/desinscription?jeton=<unsubscribe_token>
 * Le jeton figure dans chaque lettre (colonne newsletter_subscribers.unsubscribe_token).
 * La désinscription n'est faite qu'après confirmation (les antivirus de messagerie ouvrent parfois les liens).
 */
const Unsubscribe = () => {
  const [params] = useSearchParams();
  const token = params.get('jeton') ?? params.get('token') ?? '';
  const [state, setState] = useState({ status: 'idle', message: '' });

  useEffect(() => { setState({ status: 'idle', message: '' }); }, [token]);

  const confirm = async () => {
    setState({ status: 'sending', message: '' });
    const r = await unsubscribe(token);
    setState({ status: r.ok ? 'done' : 'error', message: r.message });
  };

  return (
    <article className={styles.page} aria-labelledby="unsub-title">
      <header className={styles.head}>
        <p className={styles.kicker}>Newsletter Love&amp;Faith</p>
        <h1 id="unsub-title" className={styles.title}>Se désinscrire</h1>
      </header>
      {!token ? (
        <p>Ce lien est incomplet. Utilise le lien de désinscription présent en bas de chacune de nos lettres.</p>
      ) : state.status === 'done' ? (
        <p role="status">{state.message}</p>
      ) : (
        <section>
          <p>Tu ne recevras plus nos lettres d'amour. Tu pourras te réinscrire à tout moment.</p>
          <p>
            <button type="button" onClick={confirm} disabled={state.status === 'sending'}
              style={{ marginTop: 16, padding: '10px 22px', borderRadius: 999, background: 'var(--color-red)', color: '#fff', fontWeight: 600 }}>
              {state.status === 'sending' ? 'Un instant…' : 'Confirmer la désinscription'}
            </button>
          </p>
          {state.status === 'error' && <p role="alert">{state.message}</p>}
        </section>
      )}
      <p className={styles.back}><Link to="/propager">← Retour aux créations</Link></p>
    </article>
  );
};

export default Unsubscribe;
