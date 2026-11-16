import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import styles from './NavBar.module.css';
import { NAV_LINKS } from '../../constants/navigation';
import { BRAND_ASSETS } from '../../constants/site';

/**
 * Barre de navigation bordeaux, persistante sur toutes les pages après l'intro.
 * La rubrique active est mise en évidence (y compris sur /propager/:slug).
 */
const NavBar = () => {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const menuButtonRef = useRef(null);
  const navRef = useRef(null);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    // Toucher en dehors de la barre : le menu se referme
    const closeOnOutside = (event) => {
      if (navRef.current && !navRef.current.contains(event.target)) setMenuOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    document.addEventListener('pointerdown', closeOnOutside);
    return () => {
      window.removeEventListener('keydown', closeOnEscape);
      document.removeEventListener('pointerdown', closeOnOutside);
    };
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);

  return (
    <header className={styles.wrap}>
      <nav ref={navRef} className={`${styles.bar} ${menuOpen ? styles.menuOpen : ''}`} aria-label="Navigation principale">
        <NavLink to="/propager" className={styles.brand} aria-label="Love&Faith — accueil" onClick={closeMenu}>
          <img src={BRAND_ASSETS.logo2d} alt="" className={styles.logo} />
        </NavLink>
        <button
          ref={menuButtonRef}
          type="button"
          className={styles.menuButton}
          aria-label={menuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
          aria-expanded={menuOpen}
          aria-controls="navigation-links"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span />
          <span />
          <span />
        </button>
        <ul id="navigation-links" className={styles.links}>
          {NAV_LINKS.map((link) => (
            <li key={link.id}>
              <NavLink
                to={link.path}
                className={({ isActive }) => `${styles.link} ${isActive ? styles.active : ''}`}
                onClick={closeMenu}
              >
                {link.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
};

export default NavBar;
