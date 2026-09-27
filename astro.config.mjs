// @ts-check
import { defineConfig } from 'astro/config';

// https://docs.astro.build/en/reference/configuration-reference/
export default defineConfig({
  site: 'https://homecost.it',
  // URL con slash finale (/calcolo-pittura/) generati come cartelle con index.html:
  // funzionano senza configurazioni aggiuntive su Netlify e Cloudflare Pages.
  trailingSlash: 'always',
  build: {
    format: 'directory',
    // Il CSS è piccolo: inserirlo nella pagina evita una richiesta bloccante.
    inlineStylesheets: 'always',
  },
  compressHTML: true,
  devToolbar: { enabled: false },
});
