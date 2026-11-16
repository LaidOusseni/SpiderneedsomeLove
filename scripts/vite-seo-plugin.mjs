/**
 * Plugin Vite (build uniquement) : référencement d'un site React monopage.
 *   - écrit une page HTML par route indexable (dist/<route>.html, servie en /<route> grâce à cleanUrls) avec son titre, sa description, son URL
 *     canonique, ses balises Open Graph / Twitter et ses données structurées JSON-LD déjà présentes : les moteurs
 *     et les aperçus de liens (WhatsApp, Instagram, iMessage…) les lisent sans exécuter JavaScript ;
 *   - génère sitemap.xml et robots.txt avec le domaine du site (VITE_SITE_URL).
 * Les métadonnées viennent de src/constants/seo.js, la même source que celle utilisée dans le navigateur.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'vite';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function renderTags(tags) {
  return tags.map(({ tag, attrs }) => `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}="${esc(v)}"`).join(' ')} />`).join('\n    ');
}

export default function seoPlugin() {
  let outDir = 'dist';
  let root = process.cwd();
  return {
    name: 'love-faith-seo',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
      root = config.root;
    },
    async closeBundle() {
      const server = await createServer({
        root,
        mode: 'production',
        logLevel: 'error',
        configFile: false,
        server: { middlewareMode: true, hmr: false },
        appType: 'custom',
        optimizeDeps: { noDiscovery: true, include: [] },
      });
      try {
        const seo = await server.ssrLoadModule('/src/constants/seo.js');
        const template = fs.readFileSync(path.join(outDir, 'index.html'), 'utf8');

        const page = (route) => {
          const meta = seo.getRouteSeo(route);
          const head = [
            `<title>${esc(meta.title)}</title>`,
            renderTags(seo.getHeadTags(meta)),
            `<script type="application/ld+json" id="lf-jsonld">${JSON.stringify(seo.getJsonLd(meta)).replace(/</g, '\\u003c')}</script>`,
          ].join('\n    ');
          return template
            .replace(/<title>[\s\S]*?<\/title>/, '')
            .replace(/\s*<meta name="description"[^>]*>/, '')
            .replace('</head>', `    ${head}\n  </head>`)
            .replace(/<noscript id="lf-noscript">[\s\S]*?<\/noscript>/,
              `<noscript id="lf-noscript"><h1>${esc(meta.title)}</h1><p>${esc(meta.description)}</p></noscript>`);
        };

        // Page d'accueil (« / » redirige vers /propager) puis une page par route
        fs.writeFileSync(path.join(outDir, 'index.html'), page('/'));
        const routes = seo.getIndexableRoutes();
        // /chemin → chemin.html, /propager/lva → propager/lva.html (servis sans extension : cleanUrls dans vercel.json)
        for (const route of routes) {
          const file = path.join(outDir, `${route}.html`);
          fs.mkdirSync(path.dirname(file), { recursive: true });
          fs.writeFileSync(file, page(route));
        }

        const today = new Date().toISOString().slice(0, 10);
        const urls = routes.map((route) => {
          const m = seo.getRouteSeo(route);
          const img = m.creation
            ? `\n    <image:image><image:loc>${esc(seo.absoluteUrl(m.creation.mockups.front))}</image:loc></image:image>`
            : '';
          return `  <url>\n    <loc>${esc(seo.absoluteUrl(route))}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>${m.changefreq}</changefreq>\n    <priority>${m.priority}</priority>${img}\n  </url>`;
        });
        fs.writeFileSync(path.join(outDir, 'sitemap.xml'),
          `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${urls.join('\n')}\n</urlset>\n`);
        fs.writeFileSync(path.join(outDir, 'robots.txt'),
          `User-agent: *\nAllow: /\nDisallow: /newsletter/\n\nSitemap: ${seo.SITE_URL}/sitemap.xml\n`);
        console.log(`[seo] ${routes.length} pages, sitemap.xml et robots.txt générés pour ${seo.SITE_URL}`);
      } finally {
        await server.close();
      }
    },
  };
}
