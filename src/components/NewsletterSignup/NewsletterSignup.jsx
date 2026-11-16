import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import styles from './NewsletterSignup.module.css';
import { isValidEmail, subscribe } from '../../services/newsletterService';
import { NEWSLETTER_TEXTS } from '../../constants/site';

/**
 * Inscription à la newsletter « Lettres d'amour ».
 * L'adresse est réellement enregistrée dans Supabase (newsletter_subscribers) via newsletter_subscribe :
 * validation, consentement explicite, anti-doublon et limitation de fréquence côté serveur.
 */
export default function NewsletterSignup({ id = 'newsletter', className = '' }) {
  const uid = useId();
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState(''); // champ piège (invisible)
  const [state, setState] = useState({ status: 'idle', message: '', field: null });

  const onSubmit = async (e) => {
    e.preventDefault();
    if (state.status === 'sending') return;
    if (!isValidEmail(email)) {
      setState({ status: 'error', field: 'email', message: 'Cette adresse e-mail ne semble pas valide. Vérifie-la puis réessaie.' });
      return;
    }
    if (!consent) {
      setState({ status: 'error', field: 'consent', message: "Coche la case de consentement pour recevoir nos lettres d'amour." });
      return;
    }
    setState({ status: 'sending', message: '', field: null });
    const r = await subscribe({ email, consent, website });
    if (r.ok) {
      setState({ status: 'done', message: r.message, field: null });
    } else {
      const field = r.code === 'invalid_email' ? 'email' : r.code === 'consent_required' ? 'consent' : null;
      setState({ status: 'error', message: r.message, field });
    }
  };

  const emailId = `${uid}-email`;
  const consentId = `${uid}-consent`;
  const errorId = `${uid}-error`;

  return (
    <section id={id} className={`${styles.wrap} ${className}`} aria-labelledby={`${uid}-title`}>
      <div className={styles.envelope} aria-hidden="true">
        <span className={styles.seal}>♥</span>
      </div>
      <div className={styles.content}>
        <p className={styles.kicker}>Newsletter Love&amp;Faith</p>
        <h2 id={`${uid}-title`} className={styles.title}>{NEWSLETTER_TEXTS.title}</h2>
        {NEWSLETTER_TEXTS.text.map((p) => <p key={p} className={styles.text}>{p}</p>)}

        {state.status === 'done' ? (
          <p className={styles.success} role="status">
            <span aria-hidden="true">✓ </span>{state.message}
          </p>
        ) : (
          <form className={styles.form} onSubmit={onSubmit} noValidate>
            <div className={styles.row}>
              <label htmlFor={emailId} className="sr-only">Adresse e-mail</label>
              <input
                id={emailId}
                type="email"
                inputMode="email"
                className={styles.input}
                placeholder="ton@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                maxLength={254}
                aria-invalid={state.field === 'email'}
                aria-describedby={state.status === 'error' ? errorId : undefined}
              />
              <button type="submit" className={styles.btn} disabled={state.status === 'sending'}>
                {state.status === 'sending' ? 'Envoi…' : 'Rejoindre'}
              </button>
            </div>
            <div className={styles.trap} aria-hidden="true">
              <label htmlFor={`${uid}-website`}>Site web</label>
              <input id={`${uid}-website`} type="text" tabIndex={-1} autoComplete="off" value={website}
                onChange={(e) => setWebsite(e.target.value)} />
            </div>
            <label htmlFor={consentId} className={`${styles.consent} ${state.field === 'consent' ? styles.consentError : ''}`}>
              <input id={consentId} type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)}
                aria-invalid={state.field === 'consent'} />
              <span>
                {NEWSLETTER_TEXTS.consent}{' '}
                <Link to="/confidentialite" target="_blank" rel="noopener">Confidentialité</Link>
              </span>
            </label>
            {state.status === 'error' && <p id={errorId} className={styles.error} role="alert">{state.message}</p>}
          </form>
        )}
      </div>
    </section>
  );
}
