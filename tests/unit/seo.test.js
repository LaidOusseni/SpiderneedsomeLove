import { describe, it, expect } from 'vitest';
import { getHeadTags, getIndexableRoutes, getJsonLd, getRouteSeo, SITE_URL } from '../../src/constants/seo';
import { CREATIONS } from '../../src/constants/creations';

describe('référencement', () => {
  const routes = getIndexableRoutes();

  it('liste les pages principales et chaque création', () => {
    expect(routes).toEqual(expect.arrayContaining(['/propager', '/a-propos', '/chemin']));
    for (const c of CREATIONS) expect(routes).toContain(`/propager/${c.slug}`);
  });

  it('donne à chaque page un titre unique, la marque et une description de 160 caractères max', () => {
    const titles = routes.map((r) => getRouteSeo(r).title);
    expect(new Set(titles).size).toBe(titles.length);
    for (const r of routes) {
      const seo = getRouteSeo(r);
      expect(seo.title).toMatch(/Love&Faith/);
      expect(seo.description.length).toBeGreaterThan(50);
      expect(seo.description.length).toBeLessThanOrEqual(160);
    }
    expect(getRouteSeo('/propager').title).toMatch(/Love and Faith/);
  });

  it('pointe l’URL canonique vers le domaine et ne fait pas indexer la désinscription', () => {
    const canonical = getHeadTags(getRouteSeo('/chemin')).find((t) => t.attrs.rel === 'canonical');
    expect(canonical.attrs.href).toBe(`${SITE_URL}/chemin`);
    const robots = getHeadTags(getRouteSeo('/newsletter/desinscription')).find((t) => t.attrs.name === 'robots');
    expect(robots.attrs.content).toMatch(/noindex/);
    expect(getRouteSeo('/')).toMatchObject({ path: '/propager' });
  });

  it('déclare la marque et ses variantes de nom en données structurées', () => {
    const ld = getJsonLd(getRouteSeo('/propager/heart-of-ice'));
    const org = ld['@graph'].find((n) => n['@id']?.endsWith('#organisation'));
    expect(org.alternateName).toContain('Love and Faith');
    expect(org.sameAs.length).toBeGreaterThan(0);
    expect(ld['@graph'].some((n) => n['@type'] === 'CreativeWork')).toBe(true);
  });
});
