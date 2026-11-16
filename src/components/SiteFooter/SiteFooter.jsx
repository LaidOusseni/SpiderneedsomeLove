import { Link } from 'react-router-dom';
import styles from './SiteFooter.module.css';
import { BRAND_ASSETS } from '../../constants/site';
import { FOOTER_COLUMNS, FOOTER_LEGAL } from '../../constants/footer';
import { ABOUT_VALUES } from '../../constants/about';

/** Barres du code-barres décoratif (étiquette de vêtement) — motif fixe, purement graphique. */
const BARS = [3, 1, 2, 1, 1, 3, 1, 2, 2, 1, 3, 1, 1, 2, 1, 3, 2, 1, 1, 2, 3, 1, 2, 1, 1, 3, 1, 1, 2, 2, 1, 3];

function Barcode() {
  let x = 0;
  const rects = BARS.map((w, i) => {
    const r = i % 2 === 0 ? <rect key={i} x={x} y="0" width={w * 1.6} height="34" /> : null;
    x += w * 1.6 + 1.2;
    return r;
  });
  return (
    <svg viewBox={`0 0 ${x} 34`} className={styles.barcode} aria-hidden="true" preserveAspectRatio="none">
      {rects}
    </svg>
  );
}

function FooterLink({ link }) {
  if (link.external) {
    return (
      <a href={link.href} target="_blank" rel="noopener noreferrer" className={styles.link}>
        {link.label}<span className={styles.ext} aria-hidden="true">↗</span>
        <span className="sr-only"> (nouvel onglet)</span>
      </a>
    );
  }
  return <Link to={link.to} className={styles.link}>{link.label}</Link>;
}

function Column({ column }) {
  return (
    <nav className={styles.column} aria-labelledby={`footer-${column.id}`}>
      <h2 id={`footer-${column.id}`} className={styles.columnTitle}>
        <span className={styles.columnNum} aria-hidden="true">{column.num}</span>
        {column.title}
      </h2>
      <ul className={styles.list}>
        {column.links.map((link) => (
          <li key={link.label}><FooterLink link={link} /></li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * Footer Love&Faith — pièce graphique de fin de page : fond crème, composition éditoriale asymétrique,
 * logo bisou illustré devant un cercle rouge, étiquette de vêtement. Liens : src/constants/footer.js.
 */
const SiteFooter = () => {
  const [left, right] = [FOOTER_COLUMNS.slice(0, 2), FOOTER_COLUMNS.slice(2)];
  const year = new Date().getFullYear();

  return (
    <footer className={styles.footer} aria-labelledby="footer-title">
      <h2 id="footer-title" className="sr-only">Love&amp;Faith — plan du site</h2>

      <div className={styles.top}>
        <Link to="/propager" className={styles.brand} aria-label="Love&Faith — accueil">
          <img src={BRAND_ASSETS.logo2d} alt="" width="72" height="72" className={styles.logo} loading="lazy" />
        </Link>
        <p className={styles.est}>
          <span className={styles.estRule} aria-hidden="true" />
          Est. Love&amp;Faith
          <span className={styles.estRule} aria-hidden="true" />
        </p>
        <div className={styles.label} aria-hidden="true">
          <span className={styles.labelHole} />
          <span className={styles.labelTop}>Love&amp;Faith — Maison</span>
          <Barcode />
          <span className={styles.labelBottom}>
            <span>N° LF-001</span>
            <span>Fait avec amour</span>
          </span>
        </div>
      </div>

      <div className={styles.stage}>
        <div className={styles.columns}>{left.map((c) => <Column key={c.id} column={c} />)}</div>

        <div className={styles.emblem}>
          <span className={styles.circle} aria-hidden="true" />
          <span className={styles.circleRing} aria-hidden="true" />
          <div className={styles.logoComposition}>
            <img src={BRAND_ASSETS.kissLogo} alt="Logo bisou Love&Faith" className={styles.kissLogo} loading="lazy" />
          </div>
        </div>

        <div className={`${styles.columns} ${styles.columnsRight}`}>{right.map((c) => <Column key={c.id} column={c} />)}</div>
      </div>

      <p className={styles.wordmark} aria-hidden="true">Love<span>&amp;</span>Faith</p>

      <p className={styles.values} aria-label="Nos valeurs">
        {ABOUT_VALUES.map((v, i) => (
          <span key={v}>{i > 0 && <span className={styles.dot} aria-hidden="true">✦</span>}{v}</span>
        ))}
      </p>

      <div className={styles.bottom}>
        <ul className={styles.legal}>
          {FOOTER_LEGAL.map((link) => (
            <li key={link.label}><FooterLink link={link} /></li>
          ))}
        </ul>
        <p className={styles.copy}>© {year} Love&amp;Faith</p>
      </div>
    </footer>
  );
};

export default SiteFooter;
