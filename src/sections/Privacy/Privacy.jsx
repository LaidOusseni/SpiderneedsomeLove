import { Link } from 'react-router-dom';
import styles from './Privacy.module.css';
import { PRIVACY } from '../../constants/privacy';

/**
 * Politique de confidentialité — décrit exactement les données traitées par le site :
 * vote communautaire (Supabase), newsletter (Supabase), préférences d'affichage (stockage du navigateur).
 */
const Privacy = () => (
  <article className={styles.page} aria-labelledby="privacy-title">
    <header className={styles.head}>
      <p className={styles.kicker}>Love&amp;Faith</p>
      <h1 id="privacy-title" className={styles.title}>Politique de confidentialité</h1>
      <p className={styles.updated}>Dernière mise à jour : {PRIVACY.updatedAt}</p>
    </header>

    <section>
      <h2>Qui est responsable de tes données ?</h2>
      <p>
        {PRIVACY.controller}. Pour toute question ou demande concernant tes données, écris-nous sur{' '}
        <a href={PRIVACY.contact.url} target="_blank" rel="noopener noreferrer">{PRIVACY.contact.label}</a>.
      </p>
    </section>

    <section>
      <h2>Le vote communautaire</h2>
      <p>Quand tu votes pour une création, nous enregistrons :</p>
      <ul>
        <li>ton prénom et ton nom ;</li>
        <li>ton nom d'utilisateur Instagram (tel que saisi et sous une forme normalisée) ;</li>
        <li>la création choisie et la date du vote ;</li>
        <li>
          une empreinte chiffrée et non réversible de ton adresse IP, utilisée uniquement pour limiter les envois
          abusifs (ton adresse IP elle-même n'est pas conservée).
        </li>
      </ul>
      <p>
        <strong>Pourquoi ?</strong> Uniquement pour compter les votes et appliquer la règle d'un vote par création et
        par compte Instagram. Nous ne te demandons jamais ton mot de passe ni aucune information de connexion.
      </p>
      <p>
        <strong>Qui y a accès ?</strong> Uniquement l'équipe Love&amp;Faith. Ton nom et ton Instagram ne sont jamais
        affichés sur le site : le classement public ne montre que le nombre de votes par création.
      </p>
      <p>
        Un vote n'est ni une commande ni un engagement d'achat, et ne déclenche aucun paiement.
      </p>
      <p><strong>Durée de conservation :</strong> {PRIVACY.voteRetention}.</p>
    </section>

    <section>
      <h2>La newsletter</h2>
      <p>
        Si tu t'inscris, nous enregistrons ton adresse e-mail pour t'envoyer le lien d'accès à l'application
        Love&amp;Faith et les nouvelles du projet. Durée de conservation : {PRIVACY.newsletterRetention}.
      </p>
    </section>

    <section>
      <h2>Où sont stockées les données ?</h2>
      <p>
        Les votes et les inscriptions sont stockés dans une base de données hébergée par Supabase. Le site est hébergé
        par Vercel. Les polices de caractères sont chargées depuis Google Fonts, qui reçoit à cette occasion l'adresse IP
        de ton appareil.
      </p>
    </section>

    <section>
      <h2>Stockage dans ton navigateur</h2>
      <p>
        Le site ne dépose aucun cookie publicitaire ni de mesure d'audience. Il mémorise seulement, dans ton navigateur,
        que tu as déjà vu l'introduction (le temps de ta visite) et ton mode d'affichage préféré (vue 3D ou 2D).
      </p>
    </section>

    <section>
      <h2>Tes droits</h2>
      <p>
        Tu peux demander à consulter, corriger ou supprimer tes données, ou t'opposer à leur utilisation, en nous
        écrivant sur <a href={PRIVACY.contact.url} target="_blank" rel="noopener noreferrer">{PRIVACY.contact.label}</a>.
        Tu peux aussi adresser une réclamation à la CNIL (cnil.fr).
      </p>
    </section>

    <p className={styles.back}><Link to="/propager">← Retour aux créations</Link></p>
  </article>
);

export default Privacy;
