import { Link } from 'react-router-dom';
import styles from './About.module.css';
import {
  ABOUT_NEXT_STEP, ABOUT_PAGE_TITLE, ABOUT_SECTIONS, ABOUT_VALUE_DETAILS, ABOUT_VALUES,
} from '../../constants/about';
import { BRAND_ASSETS } from '../../constants/site';
import NewsletterSignup from '../../components/NewsletterSignup/NewsletterSignup';

/** Silhouettes au trait des pièces (dessins originaux, pas des produits). */
const PIECES = {
  tee: <path d="M22 10 L12 14 L4 26 L12 31 L16 26 L16 56 L48 56 L48 26 L52 31 L60 26 L52 14 L42 10 C40 15 36 18 32 18 C28 18 24 15 22 10 Z" />,
  jacket: (
    <>
      <path d="M24 8 L12 12 L6 22 L4 58 L14 58 L16 30 L18 58 L46 58 L48 30 L50 58 L60 58 L58 22 L52 12 L40 8 L32 20 Z" />
      <path d="M32 20 L32 58 M24 8 L28 26 L32 20 M40 8 L36 26 L32 20" />
      <path d="M21 42 h7 M36 42 h7" />
    </>
  ),
  bag: (
    <>
      <path d="M10 24 L54 24 L50 58 L14 58 Z" />
      <path d="M22 24 C22 10 42 10 42 24" />
      <path d="M26 38 C26 34 32 34 32 39 C32 34 38 34 38 38 C38 43 32 46 32 48 C32 46 26 43 26 38 Z" />
    </>
  ),
  beanie: (
    <>
      <path d="M12 42 C12 22 52 22 52 42 Z" />
      <rect x="9" y="42" width="46" height="12" rx="3" />
      <circle cx="32" cy="17" r="5" />
      <path d="M17 48 v0 M24 48 v0 M31 48 v0 M38 48 v0 M45 48 v0" strokeWidth="3" strokeLinecap="round" />
    </>
  ),
  accessories: (
    <>
      <circle cx="22" cy="40" r="12" />
      <path d="M22 28 L22 8 M42 8 L42 30" />
      <path d="M34 30 h16 v8 c0 8 -16 8 -16 0 Z" />
      <path d="M8 8 C20 2 44 2 56 8" />
    </>
  ),
  capsule: (
    <>
      <rect x="8" y="16" width="34" height="42" rx="3" />
      <rect x="16" y="10" width="34" height="42" rx="3" />
      <rect x="24" y="4" width="34" height="42" rx="3" />
      <path d="M33 22 C33 18 38 18 41 23 C44 18 49 18 49 22 C49 28 41 32 41 34 C41 32 33 28 33 22 Z" />
    </>
  ),
};

/**
 * À propos de l'amour — la philosophie Love&Faith et la nouvelle étape de la marque.
 * Textes : src/constants/about.js.
 */
const About = () => (
  <section className={styles.about} aria-labelledby="about-title">
    <header className={styles.hero}>
      <img src={BRAND_ASSETS.titleIntro} alt="" className={styles.logo} aria-hidden="true" />
      <p className={styles.kicker}>L'univers Love&amp;Faith</p>
      <h1 id="about-title" className={styles.title}>{ABOUT_PAGE_TITLE}</h1>
      <ul className={styles.values} aria-label="Nos valeurs">
        {ABOUT_VALUES.map((v) => <li key={v}>{v}</li>)}
      </ul>
    </header>

    <div className={styles.chapters}>
      {ABOUT_SECTIONS.map((section, i) => (
        <article key={section.id} id={section.id} className={styles.chapter}>
          <span className={styles.num} aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
          <div>
            <h2 className={styles.question}>{section.question}</h2>
            <div className={styles.answer}>
              {section.answer.split('\n\n').map((p, k) => <p key={k}>{p.trim()}</p>)}
            </div>
          </div>
        </article>
      ))}
    </div>

    <section id="valeurs" className={styles.valuesBlock} aria-labelledby="values-title">
      <p className={styles.kicker}>Ce que nous portons</p>
      <h2 id="values-title" className={styles.blockTitle}>Nos valeurs</h2>
      <ol className={styles.valueGrid}>
        {ABOUT_VALUE_DETAILS.map((v, i) => (
          <li key={v.name} className={styles.valueCard}>
            <span className={styles.valueNum} aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
            <h3 className={styles.valueName}>{v.name}</h3>
            <p className={styles.valueText}>{v.text}</p>
          </li>
        ))}
      </ol>
    </section>

    <section id="prochaine-etape" className={styles.next} aria-labelledby="next-title">
      <div className={styles.nextText}>
        <p className={styles.kicker}>{ABOUT_NEXT_STEP.kicker}</p>
        <h2 id="next-title" className={styles.blockTitle}>{ABOUT_NEXT_STEP.title}</h2>
        {ABOUT_NEXT_STEP.paragraphs.map((p) => <p key={p} className={styles.nextP}>{p}</p>)}
      </div>

      <ul className={styles.pieces} aria-label="L'univers vestimentaire Love&Faith">
        {ABOUT_NEXT_STEP.pieces.map((piece, i) => (
          <li key={piece.id} className={`${styles.piece} ${piece.today ? styles.pieceToday : ''}`} style={{ '--i': i }}>
            <svg viewBox="0 0 64 64" className={styles.pieceIcon} aria-hidden="true">{PIECES[piece.id]}</svg>
            <span className={styles.pieceLabel}>{piece.label}</span>
            <span className={styles.pieceTag}>{piece.today ? 'Aujourd\'hui' : 'À venir'}</span>
          </li>
        ))}
      </ul>

      <blockquote className={styles.quote}>
        <span className={styles.quoteMark} aria-hidden="true">«</span>
        {ABOUT_NEXT_STEP.quote}
        <span className={styles.quoteMark} aria-hidden="true">»</span>
      </blockquote>
    </section>

    <NewsletterSignup id="newsletter-a-propos" />

    <footer className={styles.cta}>
      <p className={styles.ctaText}>Choisis la prochaine pièce Love&amp;Faith avec la communauté.</p>
      <div className={styles.ctaRow}>
        <Link to="/propager" className={styles.ctaBtn}>Découvrir les créations</Link>
        <Link to="/chemin" className={styles.ctaGhost}>Voir le classement</Link>
      </div>
    </footer>
  </section>
);

export default About;
