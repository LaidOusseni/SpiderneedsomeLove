import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import styles from './PreorderForm.module.css';
import { submitPreorder } from '../../services/preorderService';
import { normalizeInstagram, validateInstagram } from '../../utils/instagram';

const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
const EMPTY = {
  firstName: '',
  lastName: '',
  instagram: '',
  email: '',
  sizes: Object.fromEntries(SIZES.map((size) => [size, 0])),
  consent: false,
  website: '',
};

const PreorderForm = ({ creation, onSubmitted, onClose }) => {
  const id = useId();
  const [fields, setFields] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [state, setState] = useState({ phase: 'idle', message: '' });
  const sending = useRef(false);

  useEffect(() => {
    setFields(EMPTY);
    setErrors({});
    setState({ phase: 'idle', message: '' });
    sending.current = false;
  }, [creation.slug]);

  const update = (event) => {
    const { name, value, checked, type } = event.target;
    setFields((current) => ({ ...current, [name]: type === 'checkbox' ? checked : value }));
    setErrors((current) => ({ ...current, [name]: null }));
  };

  const updateSize = (size, value) => {
    setFields((current) => ({
      ...current,
      sizes: { ...current.sizes, [size]: Number(value) },
    }));
    setErrors((current) => ({ ...current, sizes: null }));
  };

  const validate = () => {
    const nextErrors = {};
    if (!fields.firstName.trim()) nextErrors.firstName = 'Indique ton prénom.';
    if (!fields.lastName.trim()) nextErrors.lastName = 'Indique ton nom.';
    if (fields.instagram.trim() && !validateInstagram(fields.instagram).ok) {
      nextErrors.instagram = 'Indique un nom d’utilisateur Instagram valide.';
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email.trim())) {
      nextErrors.email = 'Indique une adresse e-mail valide.';
    }
    if (!SIZES.some((size) => fields.sizes[size] > 0)) nextErrors.sizes = 'Choisis au moins une taille.';
    if (!fields.consent) nextErrors.consent = 'Ton accord est nécessaire pour le suivi de ta demande.';
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const submit = async (event) => {
    event.preventDefault();
    if (sending.current || !validate()) return;

    sending.current = true;
    setState({ phase: 'sending', message: '' });
    const result = await submitPreorder({
      firstName: fields.firstName,
      lastName: fields.lastName,
      instagram: normalizeInstagram(fields.instagram) || '',
      email: fields.email,
      sizes: SIZES.filter((size) => fields.sizes[size] > 0)
        .map((size) => ({ size, quantity: fields.sizes[size] })),
      consent: fields.consent,
      website: fields.website,
      creationSlug: creation.slug,
    });
    sending.current = false;

    if (result.ok) {
      setState({
        phase: 'done',
        message: 'Merci, ton intérêt est enregistré. Il ne s’agit pas d’une commande définitive et aucun paiement n’a été effectué. Nous te recontacterons lorsque le prix et les modalités de livraison seront confirmés.',
      });
      onSubmitted?.(result.count);
      return;
    }

    setState({ phase: 'error', message: result.message });
  };

  if (state.phase === 'done') {
    return (
      <div className={styles.result} aria-live="polite">
        <img src={creation.icon} alt="" className={styles.resultIcon} />
        <p className={styles.kicker}>INTÉRÊT ENREGISTRÉ</p>
        <h2 id="preorder-form-title" className={styles.title}>Merci de participer.</h2>
        <p className={styles.resultText}>{state.message}</p>
        <div className={styles.resultActions}>
          <button type="button" className={styles.submit} onClick={onClose}>Continuer</button>
          <Link to="/confidentialite" target="_blank" rel="noopener" className={styles.link}>Politique de confidentialité</Link>
        </div>
      </div>
    );
  }

  const isSending = state.phase === 'sending';

  return (
    <form className={styles.form} onSubmit={submit} noValidate aria-labelledby="preorder-form-title">
      <div className={styles.header}>
        <img src={creation.icon} alt="" className={styles.icon} />
        <div>
          <p className={styles.kicker}>DROP #01 — MANIFESTATION D’INTÉRÊT</p>
          <h2 id="preorder-form-title" className={styles.title}>{creation.name}</h2>
          <p className={styles.subtitle}>Aucun paiement, aucune commande définitive.</p>
        </div>
      </div>

      <div className={styles.field}>
        <label htmlFor={`${id}-firstName`}>Prénom</label>
        <input
          id={`${id}-firstName`}
          name="firstName"
          autoComplete="given-name"
          value={fields.firstName}
          onChange={update}
          disabled={isSending}
          aria-invalid={Boolean(errors.firstName)}
          aria-describedby={errors.firstName ? `${id}-firstName-error` : undefined}
        />
        {errors.firstName && <p id={`${id}-firstName-error`} className={styles.error}>{errors.firstName}</p>}
      </div>

      <div className={styles.field}>
        <label htmlFor={`${id}-lastName`}>Nom</label>
        <input
          id={`${id}-lastName`}
          name="lastName"
          autoComplete="family-name"
          value={fields.lastName}
          onChange={update}
          disabled={isSending}
          aria-invalid={Boolean(errors.lastName)}
          aria-describedby={errors.lastName ? `${id}-lastName-error` : undefined}
        />
        {errors.lastName && <p id={`${id}-lastName-error`} className={styles.error}>{errors.lastName}</p>}
      </div>

      <div className={styles.field}>
        <label htmlFor={`${id}-instagram`}>Nom d’utilisateur Instagram <span>(facultatif)</span></label>
        <input
          id={`${id}-instagram`}
          name="instagram"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="@ton_pseudo"
          value={fields.instagram}
          onChange={update}
          disabled={isSending}
          aria-invalid={Boolean(errors.instagram)}
          aria-describedby={errors.instagram ? `${id}-instagram-error` : undefined}
        />
        {errors.instagram && <p id={`${id}-instagram-error`} className={styles.error}>{errors.instagram}</p>}
      </div>

      <div className={styles.field}>
        <label htmlFor={`${id}-email`}>Adresse e-mail</label>
        <input
          id={`${id}-email`}
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={fields.email}
          onChange={update}
          disabled={isSending}
          aria-invalid={Boolean(errors.email)}
          aria-describedby={errors.email ? `${id}-email-error` : undefined}
        />
        {errors.email && <p id={`${id}-email-error`} className={styles.error}>{errors.email}</p>}
      </div>

      <fieldset className={styles.sizes}>
        <legend>Tailles et quantités souhaitées</legend>
        <div className={styles.sizeList}>
          {SIZES.map((size) => (
            <label key={size} className={styles.sizeRow} htmlFor={`${id}-size-${size}`}>
              <span>{size}</span>
              <select
                id={`${id}-size-${size}`}
                value={fields.sizes[size]}
                onChange={(event) => updateSize(size, event.target.value)}
                disabled={isSending}
                aria-label={`Quantité taille ${size}`}
              >
                {Array.from({ length: 11 }, (_, quantity) => (
                  <option key={quantity} value={quantity}>{quantity}</option>
                ))}
              </select>
            </label>
          ))}
        </div>
        {errors.sizes && <p className={styles.error}>{errors.sizes}</p>}
      </fieldset>

      <div className={styles.consentField}>
        <input
          id={`${id}-consent`}
          name="consent"
          type="checkbox"
          checked={fields.consent}
          onChange={update}
          disabled={isSending}
          aria-invalid={Boolean(errors.consent)}
          aria-describedby={errors.consent ? `${id}-consent-error` : undefined}
        />
        <label htmlFor={`${id}-consent`}>
          J’accepte le suivi de ma demande et d’être recontacté·e au sujet de ce drop.
        </label>
      </div>
      {errors.consent && <p id={`${id}-consent-error`} className={styles.error}>{errors.consent}</p>}

      <div className={styles.trap} aria-hidden="true">
        <label htmlFor={`${id}-website`}>Ne pas remplir</label>
        <input
          id={`${id}-website`}
          name="website"
          value={fields.website}
          onChange={update}
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      <p className={styles.small}>
        Cette démarche ne constitue ni une commande ni un paiement. Tes informations sont utilisées selon notre{' '}
        <Link to="/confidentialite" target="_blank" rel="noopener" className={styles.link}>politique de confidentialité</Link>.
      </p>

      {state.phase === 'error' && <p className={styles.formError} role="alert">{state.message}</p>}

      <button type="submit" className={styles.submit} disabled={isSending} aria-busy={isSending}>
        {isSending ? 'Enregistrement…' : 'Confirmer mon intérêt'}
      </button>
    </form>
  );
};

export default PreorderForm;
