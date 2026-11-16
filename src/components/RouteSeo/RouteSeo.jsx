import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { getHeadTags, getJsonLd, getRouteSeo } from '../../constants/seo';

const keyOf = ({ attrs }) => Object.entries(attrs).find(([k]) => k !== 'content' && k !== 'href');

/**
 * Met à jour le <head> à chaque navigation : titre, description, URL canonique, aperçus de partage, JSON-LD.
 * Les pages HTML générées au build contiennent déjà ces balises (voir scripts/vite-seo-plugin.mjs).
 */
const RouteSeo = () => {
  const { pathname } = useLocation();
  useEffect(() => {
    const seo = getRouteSeo(pathname);
    document.title = seo.title;
    for (const tag of getHeadTags(seo)) {
      const [k, v] = keyOf(tag);
      let el = document.head.querySelector(`${tag.tag}[${k}="${v}"]`);
      if (!el) {
        el = document.createElement(tag.tag);
        el.setAttribute(k, v);
        document.head.appendChild(el);
      }
      if (tag.attrs.content !== undefined) el.setAttribute('content', tag.attrs.content);
      if (tag.attrs.href !== undefined) el.setAttribute('href', tag.attrs.href);
    }
    let ld = document.getElementById('lf-jsonld');
    if (!ld) {
      ld = document.createElement('script');
      ld.type = 'application/ld+json';
      ld.id = 'lf-jsonld';
      document.head.appendChild(ld);
    }
    ld.textContent = JSON.stringify(getJsonLd(seo));
  }, [pathname]);
  return null;
};

export default RouteSeo;
