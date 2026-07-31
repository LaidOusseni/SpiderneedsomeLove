import { useNavigate } from 'react-router-dom';
import styles from './About.module.css';
import ComicHeader from '../../components/ComicHeader/ComicHeader';
import { ABOUT_SECTIONS, ABOUT_PAGE_TITLE } from '../../constants/about';
import { NAV_LINKS } from '../../constants/navigation';

/**
 * Section 4 — Pourquoi Love&Faith
 * Red background, structured Q&A text, Sparkle Halftone decoration
 */
const About = () => {
  const navigate = useNavigate();

  return (
    <section className={styles.about} id="about">
      <ComicHeader links={NAV_LINKS} onLinkClick={(path) => navigate(path)} />
      {/* Decorative sparkle */}
      <img
        src="/Icon/Sparkle halftone.png"
        alt=""
        className={styles.sparkleTop}
        aria-hidden="true"
      />

      <div className={styles.container}>
        <h1 className={styles.mainTitle}>{ABOUT_PAGE_TITLE}</h1>

        <div className={styles.sections}>
          {ABOUT_SECTIONS.map((section) => (
            <div key={section.id} className={styles.item}>
              <h2 className={styles.question}>{section.question}</h2>
              <p className={styles.answer} style={{ whiteSpace: 'pre-line' }}>{section.answer}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Decorative sparkle bottom */}
      <img
        src="/Icon/Sparkle halftone.png"
        alt=""
        className={styles.sparkleBottom}
        aria-hidden="true"
      />
    </section>
  );
};

export default About;
