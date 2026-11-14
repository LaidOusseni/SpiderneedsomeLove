import { useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import styles from './PreorderForm.module.css';
import { submitPreorder } from '../../services/preorderService';

const EMPTY = {
  firstName: '',
  lastName: '',
  email: '',
  size: 'M',
  quantity: 1,
  deliveryInfo: '',
};

const PreorderForm = ({ creation, onSubmitted, onClose }) => {
  const id = useId();
  const [fields, setFields] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [state, setState] = useState({ phase: 'idle', message: '' });
  const sending = useRef(false);

  const update = (event) => {
    const { name, value } = event.target;
    setFields((current) => ({ ...current, [name]: value }));
    if (errors[name]) {
      setErrors((current) => ({ ...current, [name]: null }));
    }
  };

  const validate = () => {
    const nextErrors = {};
    if (!fields.firstName.trim()) nextErrors.firstName = 'Indique ton prénom.';
    if (!fields.lastName.trim()) nextErrors.lastName = 'Indique ton nom.';
    if (!fields.email.trim()) nextErrors.email = 'Indique ton adresse e-mail.';
    if (!fields.size.trim()) nextErrors.size = 'Choisis une taille.';
    if (Number(fields.quantity) < 1) nextErrors.quantity = 'La quantité doit être au moins de 1.';
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const submit = async (event) => {
    event.preventDefault();
    if (sending.current || !validate()) return;

    sending.current = true;
    setState({ phase: 'sending', message: '' });
    const result = await submitPreorder({ ...fields, creationSlug: creation.slug });
    sending.current = false;

    if (result.ok) {
      setState({ phase: 'done', message: result.message });
      onSubmitted?.(result.count ?? 0);
      return;
    }

    setState({ phase: 'error', message: result.message });
    if (result.code === 'invalid_email') {
      setErrors({ email: result.message });
    }
  };

  if (state.phase === 'done') {
    return (
      <div className={styles.result} aria-live="polite">
        <img src={creation.icon} alt="" className={styles.resultIcon} />
        <h2 className={styles.title}>Précommande enregistrée</h2>
        <p className={styles.resultText}>{state.message}</p>
        <p className={styles.small}>Les paiements seront activés plus tard. Pour le moment, cette précommande confirme seulement votre intérêt.</p>
        <div className={styles.resultActions}>
          <button type="button" className={styles.submit} onClick={onClose}>Continuer</button>
          <Link to="/confidentialite" target="_blank" rel="noopener" className={styles.link}>Politique de confidentialité</Link>
        </div>
      </div>
    );
  }

  const isSending = state.phase === 'sending';

  return (
    <form className={styles.form} onSubmit={submit} noValidate aria-labelledby={`${id}-title`}>
      <div className={styles.header}>
        <img src={creation.icon} alt="" className={styles.icon} />
        <div>
          <p className={styles.kicker}>DROP #01 — PRÉCOMMANDES OUVERTES</p>
          <h2 id={`${id}-title`} className={styles.title}>{creation.name}</h2>
          <p className={styles.subtitle}>{creation.subtitle || 'Batman — T-shirt Love&Faith'}</p>
        </div>
      </div>

      <p className={styles.purpose}>
        Cette précommande confirme votre intérêt pour le premier drop Love&Faith. Aucun paiement n'est effectué à ce stade.
      </p>

      <div className={styles.grid}>
        <div className={styles.field}>
          <label htmlFor={`${id}-firstName`}>Prénom</label>
          <input id={`${id}-firstName`} name="firstName" value={fields.firstName} onChange={update} disabled={isSending} aria-invalid={Boolean(errors.firstName)} />
          {errors.firstName && <p className={styles.error}>{errors.firstName}</p>}
        </div>

        <div className={styles.field}>
          <label htmlFor={`${id}-lastName`}>Nom</label>
          <input id={`${id}-lastName`} name="lastName" value={fields.lastName} onChange={update} disabled={isSending} aria-invalid={Boolean(errors.lastName)} />
          {errors.lastName && <p className={styles.error}>{errors.lastName}</p>}
        </div>

        <div className={styles.field}>
          <label htmlFor={`${id}-email`}>Adresse e-mail</label>
          <input id={`${id}-email`} name="email" type="email" value={fields.email} onChange={update} disabled={isSending} aria-invalid={Boolean(errors.email)} />
          {errors.email && <p className={styles.error}>{errors.email}</p>}
        </div>

        <div className={styles.field}>
          <label htmlFor={`${id}-size`}>Taille souhaitée</label>
          <select id={`${id}-size`} name="size" value={fields.size} onChange={update} disabled={isSending} aria-invalid={Boolean(errors.size)}>
            <option value="XS">XS</option>
            <option value="S">S</option>
            <option value="M">M</option>
            <option value="L">L</option>
            <option value="XL">XL</option>
            <option value="XXL">XXL</option>
          </select>
          {errors.size && <p className={styles.error}>{errors.size}</p>}
        </div>

        <div className={styles.field}>
          <label htmlFor={`${id}-quantity`}>Quantité</label>
          <input id={`${id}-quantity`} name="quantity" type="number" min="1" max="10" value={fields.quantity} onChange={update} disabled={isSending} aria-invalid={Boolean(errors.quantity)} />
          {errors.quantity && <p className={styles.error}>{errors.quantity}</p>}
        </div>

        <div className={styles.field}>
          <label htmlFor={`${id}-deliveryInfo`}>Informations de livraison</label>
          <textarea id={`${id}-deliveryInfo`} name="deliveryInfo" rows="3" value={fields.deliveryInfo} onChange={update} disabled={isSending} placeholder="Adresse, code postal, ville, informations utiles…" />
        </div>
      </div>

      <p className={styles.small}>Cette demande ne constitue pas un paiement réel. Elle permet d'enregistrer votre intérêt avant l'ouverture commerciale complète.</p>

      {state.phase === 'error' && <p className={styles.formError} role="alert">{state.message}</p>}

      <button type="submit" className={styles.submit} disabled={isSending} aria-busy={isSending}>
        {isSending ? 'Enregistrement…' : 'Confirmer ma précommande'}
      </button>
    </form>
  );
};

export default PreorderForm;
