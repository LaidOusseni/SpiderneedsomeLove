import { Link } from 'react-router-dom';
import styles from '../Privacy/Privacy.module.css';
import { PRIVACY } from '../../constants/privacy';
import { LEGAL } from '../../constants/legal';

/** Mentions légales — paramètres dans src/constants/legal.js (identité de l'éditeur à compléter par Love&Faith). */
const LegalNotice = () => (
  <article className={styles.page} aria-labelledby="legal-title">
    <header className={styles.head}>
      <p className={styles.kicker}>Love&amp;Faith</p>
      <h1 id="legal-title" className={styles.title}>Mentions légales</h1>
      <p className={styles.updated}>Dernière mise à jour : {LEGAL.updatedAt}</p>
    </header>

    <section>
      <h2>Éditeur du site</h2>
      <p>{LEGAL.publisher}</p>
      {LEGAL.publisherDetails.map((line) => <p key={line}>{line}</p>)}
      <p>
        LinkedIn du fondateur :{' '}
        <a href={LEGAL.linkedin} target="_blank" rel="noopener noreferrer">Laïd Ousseni</a>
      </p>
      <p>
        Contact :{' '}
        <a href={PRIVACY.contact.url} target="_blank" rel="noopener noreferrer">{PRIVACY.contact.label}</a>
      </p>
      <p>
        Site conçu et développé par{' '}
        <a href={LEGAL.designer.url} target="_blank" rel="noopener noreferrer">{LEGAL.designer.label}</a>.
      </p>
      {import.meta.env.DEV && LEGAL.todo && <p><em>À compléter : {LEGAL.todo}</em></p>}
    </section>

    <section>
      <h2>Hébergement</h2>
      <p>{LEGAL.host.name} — {LEGAL.host.address}.</p>
      <p>Base de données : {LEGAL.database}.</p>
    </section>

    <section>
      <h2>Propriété intellectuelle</h2>
      <p>
        Les créations, illustrations, visuels, textes et logos présentés sur ce site sont la propriété de Love&amp;Faith,
        sauf mention contraire. Toute reproduction ou réutilisation sans autorisation est interdite.
      </p>
      <p>
        Les références culturelles évoquées dans les histoires des créations (personnages, œuvres, artistes) appartiennent
        à leurs auteurs respectifs et sont citées comme sources d'inspiration.
      </p>
    </section>

    <section>
      <h2>Données personnelles</h2>
      <p>
        Le traitement des données liées au vote, aux précommandes et à la newsletter est décrit dans la{' '}
        <Link to="/confidentialite">politique de confidentialité</Link>.
      </p>
    </section>

    <p className={styles.back}><Link to="/propager">← Retour aux créations</Link></p>
  </article>
);

export default LegalNotice;
