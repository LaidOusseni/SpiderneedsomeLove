import { Link } from 'react-router-dom';
import styles from './About.module.css';
import { ABOUT_SECTIONS, ABOUT_PAGE_TITLE, ABOUT_VALUES } from '../../constants/about';
import { BRAND_ASSETS } from '../../constants/site';

/**
 * À propos de l'amour — la philosophie Love&Faith.
 * Textes : src/constants/about.js (repris de la V1).
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
        <article key={section.id} className={styles.chapter}>
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

    <footer className={styles.cta}>
      <p className={styles.ctaText}>Les vêtements ne sont qu'un support. Ce que nous partageons, ce sont des valeurs.</p>
      <Link to="/propager" className={styles.ctaBtn}>Choisir le prochain drop</Link>
    </footer>
  </section>
);

export default About;
