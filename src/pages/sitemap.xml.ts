import type { APIRoute } from 'astro';
import { CALCULATORS, INFO_PAGES, LEGAL_PAGES } from '../config/calculators';
import { SITE } from '../config/site';

/** Sitemap generata in fase di build a partire dall'elenco delle pagine. */
export const GET: APIRoute = () => {
  const lastmod = new Date().toISOString().slice(0, 10);
  const pages = [
    { path: '/', priority: '1.0', changefreq: 'weekly' },
    ...CALCULATORS.map((c) => ({
      path: c.path,
      priority: '0.9',
      changefreq: c.id === 'istat' ? 'monthly' : 'yearly',
    })),
    ...INFO_PAGES.map((p) => ({ path: p.path, priority: '0.4', changefreq: 'yearly' })),
    ...LEGAL_PAGES.map((p) => ({ path: p.path, priority: '0.2', changefreq: 'yearly' })),
  ];
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages
  .map(
    (p) =>
      `  <url><loc>${SITE.url}${p.path}</loc><lastmod>${lastmod}</lastmod><changefreq>${p.changefreq}</changefreq><priority>${p.priority}</priority></url>`,
  )
  .join('\n')}
</urlset>
`;
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
