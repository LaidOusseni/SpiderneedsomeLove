import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './Journey.module.css';
import ComicHeader from '../../components/ComicHeader/ComicHeader';
import { SOCIALS } from '../../constants/socials';
import { NAV_LINKS } from '../../constants/navigation';
import { subscribe } from '../../services/newsletterService';
import { countPreorders } from '../../services/preorderService';

/**
 * Section 5 — Suivez le chemin de l'amour
 *
 * Nouveautés V1.1 :
 * - Newsletter connectée à Supabase (newsletterService.subscribe)
 * - Compteur communautaire tiré de Supabase (preorderService.countPreorders)
 * - Gestion erreurs : si Supabase inaccessible → phrase de fallback, site non planté
 */
const Journey = () => {
  const navigate = useNavigate();

  // ── Newsletter ──
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsError, setNewsError] = useState(null);

  // ── Compteur communautaire ──
  const [count, setCount] = useState(null);   // null = chargement en cours
  const [countError, setCountError] = useState(false);

  const handleNavClick = (path) => navigate(path);

  // Étape 7 — Fetch du compteur au montage de la page
  useEffect(() => {
    let cancelled = false;

    async function fetchCount() {
      try {
        const total = await countPreorders();
        if (!cancelled) setCount(total);
      } catch {
        // Étape 8 — Erreur silencieuse, on affiche la phrase de fallback
        if (!cancelled) setCountError(true);
      }
    }

    fetchCount();

    return () => {
      cancelled = true;
    };
  }, []);

  // Étape 6 — Texte du compteur gérant singulier/pluriel
  const counterText = () => {
    if (countError || count === null) {
      // Fallback (Étape 8) : Supabase inaccessible
      return "Rejoins les premiers membres de Love&Faith ❤️";
    }
    if (count === 0) {
      return "Sois la première personne à propager l'amour ❤️";
    }
    if (count === 1) {
      return "1 personne propage déjà l'amour ❤️";
    }
    return `${count} personnes propagent déjà l'amour ❤️`;
  };

  // Étape 5 — Newsletter connectée à Supabase
  const handleNewsletterSubmit = async (e) => {
    e.preventDefault();
    if (!email || newsLoading) return;

    setNewsLoading(true);
    setNewsError(null);

    try {
      await subscribe(email);
      setSubmitted(true);
    } catch {
      setNewsError(
        'Une erreur est survenue. Réessaie ou contacte-nous sur Instagram.'
      );
    } finally {
      setNewsLoading(false);
    }
  };

  return (
    <section className={styles.journey} id="journey">

      {/* ── Gif Spider-Man — décoration haut droite ── */}
      <img
        src="/Icon/Gif spiderman.gif"
        alt=""
        className={styles.spiderman}
        aria-hidden="true"
      />

      {/* Bandeau de navigation */}
      <ComicHeader links={NAV_LINKS} onLinkClick={handleNavClick} />

      <div className={styles.container}>
        <h2 className={styles.title}>Suivez le chemin de l'amour</h2>

        {/* ── Réseaux sociaux ── */}
        <div className={styles.socials}>
          {SOCIALS.map((social) => (
            <a
              key={social.id}
              href={social.url}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.socialLink}
              aria-label={`Nous suivre sur ${social.label}`}
            >
              <span className={styles.socialLabel}>{social.label}</span>
              <span className={styles.socialHandle}>{social.handle}</span>
            </a>
          ))}
        </div>

        {/* ── Compteur communautaire — Étapes 6, 7, 8 ── */}
        <div className={styles.counterCard} aria-live="polite">
          <p className={styles.counterText}>
            {count === null && !countError ? (
              // Chargement en cours
              <span className={styles.counterLoading}>❤️</span>
            ) : (
              counterText()
            )}
          </p>
        </div>

        {/* ── Newsletter — Étape 5 ── */}
        <div className={styles.newsletter}>
          <p className={styles.newsletterLabel}>
            Reste informé(e) des prochaines aventures
          </p>
          {!submitted ? (
            <form className={styles.emailForm} onSubmit={handleNewsletterSubmit}>
              <input
                type="email"
                className={styles.emailInput}
                placeholder="ton@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                aria-label="Adresse e-mail newsletter"
              />
              <button
                type="submit"
                className={styles.emailBtn}
                disabled={newsLoading}
              >
                {newsLoading ? '...' : 'Rejoindre'}
              </button>
            </form>
          ) : (
            <p className={styles.successMsg}>
              ✓ Tu fais maintenant partie de l'aventure.
            </p>
          )}
          {newsError && (
            <p className={styles.newsError} role="alert">
              {newsError}
            </p>
          )}
        </div>

        {/* ── Future app teaser ── */}
        <div className={styles.appTeaser}>
          <img
            src="/Icon/Exclamation comic.png"
            alt=""
            className={styles.exclamation}
            aria-hidden="true"
          />
          <div className={styles.appText}>
            <p className={styles.appTitle}>Une application arrive.</p>
            <p className={styles.appDesc}>
              Un espace pour se retrouver, partager, grandir ensemble.
              <br />
              L'histoire Love&amp;Faith ne fait que commencer.
            </p>
          </div>
        </div>

        {/* ── Logo ── */}
        <div className={styles.logoWrapper}>
          <img src="/Intro/Kiss Love.png" alt="Love & Faith" className={styles.logo} />
        </div>
      </div>
    </section>
  );
};

export default Journey;
