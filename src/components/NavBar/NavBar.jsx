import { NavLink } from 'react-router-dom';
import styles from './NavBar.module.css';
import { NAV_LINKS } from '../../constants/navigation';
import { BRAND_ASSETS } from '../../constants/site';

/**
 * Barre de navigation bordeaux, persistante sur toutes les pages après l'intro.
 * La rubrique active est mise en évidence (y compris sur /propager/:slug).
 */
const NavBar = () => (
  <header className={styles.wrap}>
    <nav className={styles.bar} aria-label="Navigation principale">
      <NavLink to="/propager" className={styles.brand} aria-label="Love&Faith — accueil">
        <img src={BRAND_ASSETS.logo2d} alt="" className={styles.logo} />
      </NavLink>
      <ul className={styles.links}>
        {NAV_LINKS.map((link) => (
          <li key={link.id}>
            <NavLink
              to={link.path}
              className={({ isActive }) => `${styles.link} ${isActive ? styles.active : ''}`}
            >
              {link.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  </header>
);

export default NavBar;
