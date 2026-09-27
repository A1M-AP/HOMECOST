/**
 * Configurazione generale del sito: dati del sito, analisi statistiche e pubblicità.
 * I link e i testi di affiliazione sono in `src/config/affiliates.ts`.
 */

export const SITE = {
  name: 'HomeCost',
  url: 'https://homecost.it',
  lang: 'it',
  locale: 'it_IT',
  tagline: 'Calcolatori gratuiti per casa ed energia',
  description:
    'Calcolatori gratuiti per casa ed energia: costo in bolletta degli elettrodomestici, pittura, piastrelle, cartongesso, parquet e rivalutazione ISTAT dell’affitto.',
  /** Indirizzo mostrato nella pagina Contatti e nelle pagine legali. */
  email: 'info@homecost.it',
  /** Immagine usata per l'anteprima nei social (1200×630). */
  ogImage: '/og-image.jpg',
  themeColor: '#0f766e',
} as const;

/**
 * Prezzo indicativo dell'energia elettrica (€/kWh, tutto compreso: materia prima,
 * trasporto, oneri e imposte) proposto nel calcolatore dei consumi.
 * È solo un punto di partenza: l'utente è invitato a inserire quello della sua bolletta.
 */
export const ENERGY_PRICE_DEFAULT = 0.28;

/**
 * Statistiche. Lascia vuoto per non caricare nulla.
 * Lo script viene caricato solo dopo il consenso alla categoria "statistiche".
 */
export const ANALYTICS = {
  /** ID Google Analytics 4, es. "G-XXXXXXXXXX". */
  ga4Id: '',
};

/**
 * Pubblicità. Gli spazi sono sempre riservati nella pagina (nessuno spostamento del
 * layout); lo script dell'inserzionista viene caricato solo dopo il consenso alla
 * categoria "pubblicità".
 */
export const ADS = {
  /** false = gli spazi pubblicitari non vengono proprio inseriti nelle pagine. */
  enabled: true,
  /** ID editore Google AdSense, es. "ca-pub-1234567890123456". Vuoto = solo segnaposto. */
  adsenseClient: '',
  /** ID delle unità pubblicitarie AdSense per ciascuno spazio. */
  slots: {
    result: '', // sotto il risultato del calcolatore
    sidebar: '', // colonna laterale (solo desktop)
  },
};

/** Impostazioni del banner cookie. */
export const CONSENT = {
  /** Aumenta la versione se cambiano finalità o fornitori: il banner verrà riproposto. */
  version: 1,
  /** Dopo quanti giorni la scelta scade e il banner viene riproposto. */
  maxAgeDays: 180,
  storageKey: 'homecost-consent',
};
