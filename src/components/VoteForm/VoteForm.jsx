import { useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import styles from './VoteForm.module.css';
import { castVote } from '../../services/voteService';
import { cleanName, validateInstagram } from '../../utils/instagram';
import { VOTE_TEXTS } from '../../constants/site';

/**
 * Formulaire de vote pour UNE création.
 * Le slug est fixé à l'ouverture (prop `creation`) : le vote ne peut pas partir vers une autre création.
 * Le contrôle définitif (doublon, statut, fréquence) est fait par la base (cast_vote).
 */
const VoteForm = ({ creation, onVoted, onClose }) => {
  const id = useId();
  const [fields, setFields] = useState({ firstName: '', lastName: '', instagram: '', website: '' });
  const [errors, setErrors] = useState({});
  const [state, setState] = useState({ phase: 'idle', message: '' }); // idle | sending | done | already | error
  const sending = useRef(false);
  const slug = useRef(creation.slug).current;

  const update = (e) => {
    const { name, value } = e.target;
    setFields((f) => ({ ...f, [name]: value }));
    if (errors[name]) setErrors((er) => ({ ...er, [name]: null }));
  };

  const validate = () => {
    const er = {};
    if (!cleanName(fields.firstName)) er.firstName = 'Indique ton prénom.';
    if (!cleanName(fields.lastName)) er.lastName = 'Indique ton nom.';
    const ig = validateInstagram(fields.instagram);
    if (!ig.ok) er.instagram = ig.error;
    setErrors(er);
    return Object.keys(er).length === 0;
  };

  const submit = async (e) => {
    e.preventDefault();
    if (sending.current) return; // anti double-clic (la base bloque aussi les doublons)
    if (!validate()) return;
    sending.current = true;
    setState({ phase: 'sending', message: '' });
    const res = await castVote({ creationSlug: slug, ...fields });
    sending.current = false;
    if (res.ok) {
      setState({ phase: 'done', message: VOTE_TEXTS.success });
      onVoted?.(slug, res.votes);
    } else if (res.code === 'already_voted') {
      setState({ phase: 'already', message: res.message });
      onVoted?.(slug, res.votes);
    } else if (res.code === 'invalid_instagram') {
      setErrors({ instagram: res.message });
      setState({ phase: 'idle', message: '' });
    } else {
      setState({ phase: 'error', message: res.message });
    }
  };

  if (state.phase === 'done' || state.phase === 'already') {
    return (
      <div className={styles.result} aria-live="polite">
        <img src={creation.icon} alt="" className={styles.resultIcon} />
        <h2 id={`${id}-title`} className={styles.title}>
          {state.phase === 'done' ? 'Vote enregistré' : 'Vote déjà enregistré'}
        </h2>
        <p className={styles.resultText}>{state.message}</p>
        <p className={styles.small}>Tu peux aussi voter pour d'autres créations qui te parlent.</p>
        <div className={styles.resultActions}>
          <button type="button" className={styles.submit} onClick={onClose}>Continuer</button>
          <Link to="/chemin" className={styles.link} onClick={onClose}>Voir le chemin de l'amour →</Link>
        </div>
      </div>
    );
  }

  const sendingNow = state.phase === 'sending';
  const fieldProps = (name) => ({
    id: `${id}-${name}`,
    name,
    value: fields[name],
    onChange: update,
    disabled: sendingNow,
    'aria-invalid': Boolean(errors[name]),
    'aria-describedby': errors[name] ? `${id}-${name}-err` : undefined,
  });

  return (
    <form className={styles.form} onSubmit={submit} noValidate aria-labelledby={`${id}-title`}>
      <div className={styles.header}>
        <img src={creation.icon} alt="" className={styles.icon} />
        <div>
          <p className={styles.kicker}>Tu votes pour</p>
          <h2 id={`${id}-title`} className={styles.title}>{creation.name}</h2>
          {creation.subtitle && <p className={styles.subtitle}>{creation.subtitle}</p>}
        </div>
      </div>

      <p className={styles.purpose}>{VOTE_TEXTS.purpose}</p>

      <div className={styles.row}>
        <div className={styles.field}>
          <label htmlFor={`${id}-firstName`}>Prénom</label>
          <input {...fieldProps('firstName')} autoComplete="given-name" maxLength={60} required />
          {errors.firstName && <p id={`${id}-firstName-err`} className={styles.error}>{errors.firstName}</p>}
        </div>
        <div className={styles.field}>
          <label htmlFor={`${id}-lastName`}>Nom</label>
          <input {...fieldProps('lastName')} autoComplete="family-name" maxLength={60} required />
          {errors.lastName && <p id={`${id}-lastName-err`} className={styles.error}>{errors.lastName}</p>}
        </div>
      </div>

      <div className={styles.field}>
        <label htmlFor={`${id}-instagram`}>Nom d'utilisateur Instagram</label>
        <div className={styles.igWrap}>
          <span className={styles.at} aria-hidden="true">@</span>
          <input
            {...fieldProps('instagram')}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            inputMode="text"
            maxLength={120}
            placeholder="ton_pseudo"
            required
          />
        </div>
        {errors.instagram && <p id={`${id}-instagram-err`} className={styles.error}>{errors.instagram}</p>}
      </div>

      {/* Champ piège anti-robot : invisible pour les humains, vérifié côté serveur */}
      <div className={styles.trap} aria-hidden="true">
        <label htmlFor={`${id}-website`}>Site web</label>
        <input id={`${id}-website`} name="website" tabIndex={-1} autoComplete="off" value={fields.website} onChange={update} />
      </div>

      <p className={styles.small}>{VOTE_TEXTS.rule}</p>
      <p className={styles.small}>
        {VOTE_TEXTS.why} Voir la{' '}
        <Link to="/confidentialite" target="_blank" rel="noopener" className={styles.link}>politique de confidentialité</Link>.
      </p>

      {state.phase === 'error' && <p className={styles.formError} role="alert">{state.message}</p>}

      <button type="submit" className={styles.submit} disabled={sendingNow} aria-busy={sendingNow}>
        {sendingNow ? 'Enregistrement…' : `Confirmer mon vote pour ${creation.name}`}
      </button>
    </form>
  );
};

export default VoteForm;
