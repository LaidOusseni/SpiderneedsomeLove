import { Link } from 'react-router-dom';
import styles from './Privacy.module.css';
import { PRIVACY } from '../../constants/privacy';
import AnalyticsChoice from '../../components/AnalyticsChoice/AnalyticsChoice';

/**
 * Politique de confidentialité — décrit exactement les données traitées par le site :
 * vote communautaire (Supabase), newsletter (Supabase), préférences d'affichage (stockage du navigateur).
 */
/** Contenu de la politique (page /confidentialite et popup du formulaire de vote). */
export const PrivacySections = () => (
  <>
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
        Si tu t'inscris, nous enregistrons ton adresse e-mail, la date de ton consentement et ton statut d'inscription
        pour t'envoyer nos « lettres d'amour » : nouvelles collections, prochains drops, projets et événements Love&amp;Faith.
        Ton adresse n'est jamais affichée sur le site ni transmise à des tiers. Chaque lettre contient un lien de
        désinscription. Durée de conservation : {PRIVACY.newsletterRetention}.
      </p>
    </section>

    <section>
      <h2>La précommande</h2>
      <p>
        Si tu manifestes ton intérêt pour un drop, nous enregistrons ton prénom, ton nom, ton adresse e-mail, le nom
        d’utilisateur Instagram si tu le renseignes, les tailles et quantités souhaitées, la date de ton consentement et
        une empreinte salée de ton adresse IP (ou de ton e-mail
        si l'adresse IP n'est pas transmise) pour limiter les envois abusifs. Le champ anti-robot n'est pas conservé.
        Ces informations servent uniquement à estimer l'intérêt
        et les quantités envisagées, puis à te tenir informé·e si tu y as consenti. Cette démarche n'est pas une commande
        et aucun paiement n'est demandé. Durée de conservation : {PRIVACY.preorderRetention}.
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
      <h2>Mesure d'audience</h2>
      <p>
        Pour comprendre comment le site est utilisé (pages consultées, temps passé, utilisation du jeu et du lecteur
        musical), nous enregistrons des statistiques anonymes dans notre base Supabase : la page vue, le type d'appareil
        (téléphone, tablette ou ordinateur), le morceau écouté et la durée d'écoute, l'ouverture du jeu et, si le jeu les
        transmet, le score et le mode de fin de partie.
      </p>
      <p>
        Ces statistiques sont rattachées à un identifiant aléatoire créé dans ton navigateur (renouvelé tous les 13 mois),
        qui ne contient ni ton nom, ni ton e-mail, ni ton adresse IP. Aucun cookie, aucun service de mesure tiers, aucune
        publicité et aucun suivi d'un site à l'autre. Seul l'administrateur Love&amp;Faith consulte les résultats, sous
        forme de chiffres agrégés. Durée de conservation : 25 mois.
      </p>
      <p>
        Si ton navigateur envoie le signal « Do Not Track » ou « Global Privacy Control », aucune statistique n'est
        enregistrée. Tu peux aussi refuser la mesure d'audience à tout moment :
      </p>
      <AnalyticsChoice />
    </section>

    <section>
      <h2>Jouer avec l'amour (51 Wheeling)</h2>
      <p>
        Le jeu 51 Wheeling est édité par 5HC et fonctionne depuis son site officiel, 51games.fr, affiché dans la page
        « Jouer avec l'amour ». Lorsque tu ouvres cette page, ton navigateur se connecte à 51games.fr, qui gère ses propres
        comptes, classements, achats et données selon ses propres conditions. Love&amp;Faith ne reçoit aucune de ces
        informations, hormis les événements de jeu anonymes décrits ci-dessus.
      </p>
    </section>

    <section>
      <h2>Stockage dans ton navigateur</h2>
      <p>
        Le site ne dépose aucun cookie publicitaire. Il mémorise seulement, dans ton navigateur : que tu as déjà vu
        l'introduction et l'heure de ta dernière activité (pour ne pas la rejouer pendant ta visite), l'identifiant
        aléatoire de mesure d'audience (sauf si tu l'as refusée), le réglage de volume du lecteur musical et, après un
        vote, un identifiant aléatoire qui permet d'afficher les créations pour lesquelles tu as déjà voté.
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
  </>
);

const Privacy = () => (
  <article className={styles.page} aria-labelledby="privacy-title">
    <header className={styles.head}>
      <p className={styles.kicker}>Love&amp;Faith</p>
      <h1 id="privacy-title" className={styles.title}>Politique de confidentialité</h1>
      <p className={styles.updated}>Dernière mise à jour : {PRIVACY.updatedAt}</p>
    </header>

    <PrivacySections />

    <p className={styles.back}><Link to="/propager">← Retour aux créations</Link></p>
  </article>
);

export default Privacy;
