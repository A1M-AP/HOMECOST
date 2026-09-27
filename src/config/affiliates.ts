/**
 * MONETIZZAZIONE — file unico per link e testi di affiliazione.
 *
 * - AMAZON_TAG: il tuo ID di tracciamento Amazon (es. "homecost-21").
 * - AFFILIATE_BOXES: i box "call to action" (es. confronto offerte luce e gas).
 * - PRODUCTS: le 3 schede "Prodotti consigliati" di ciascun calcolatore.
 *
 * Tutti i valori qui sotto sono SEGNAPOSTO da sostituire prima della pubblicazione.
 */

/** ID di tracciamento Amazon Associates (parametro `tag=` dei link). */
export const AMAZON_TAG = 'AFFILIATE_TAG';

/** Dominio Amazon usato per i link prodotto. */
export const AMAZON_BASE = 'https://www.amazon.it';

/** Testo mostrato vicino a ogni link affiliato. */
export const AFFILIATE_DISCLOSURE =
  'Alcuni link sono affiliati: se acquisti, HomeCost può ricevere una commissione senza costi aggiuntivi per te.';

/** Dichiarazione richiesta dal Programma Affiliazione Amazon (mostrata nel footer). */
export const AMAZON_DISCLOSURE =
  'In qualità di Affiliato Amazon, HomeCost riceve un guadagno dagli acquisti idonei.';

export interface AffiliateBoxConfig {
  /** false = il box non viene mostrato. */
  enabled: boolean;
  title: string;
  text: string;
  cta: string;
  url: string;
  /** Piccola nota sotto il pulsante (facoltativa). */
  note?: string;
}

export const AFFILIATE_BOXES = {
  energia: {
    enabled: true,
    title: 'Stai pagando troppo l’energia? Confronta le offerte luce e gas',
    text: 'Ora che conosci i consumi dei tuoi elettrodomestici, verifica se con un’altra tariffa spenderesti meno. Il confronto è gratuito e non ti obbliga a cambiare fornitore.',
    cta: 'Confronta le offerte luce e gas',
    url: 'https://www.example.com/confronto-offerte-luce-gas?ref=homecost', // SEGNAPOSTO
    note: 'Servizio offerto da un partner esterno.',
  },
  assicurazioneCasa: {
    enabled: true,
    title: 'Affitti un immobile? Proteggilo con una polizza casa',
    text: 'Confronta le assicurazioni per proprietari che affittano: danni all’immobile, incendio e responsabilità civile verso terzi.',
    cta: 'Confronta le polizze casa',
    url: 'https://www.example.com/confronto-assicurazioni-casa?ref=homecost', // SEGNAPOSTO
    note: 'Servizio offerto da un partner esterno.',
  },
} satisfies Record<string, AffiliateBoxConfig>;

export type AffiliateBoxId = keyof typeof AFFILIATE_BOXES;

export interface Product {
  name: string;
  description: string;
  /** Ricerca su Amazon usata se non indichi `asin` o `url`. */
  query: string;
  /** Codice ASIN del prodotto (facoltativo): genera un link diretto alla scheda. */
  asin?: string;
  /** URL completo (facoltativo): ha la precedenza su `asin` e `query`. */
  url?: string;
  /** Immagine in /public (facoltativa). Dimensioni consigliate 320×240. */
  image?: string;
}

export const PRODUCT_PLACEHOLDER_IMAGE = '/img/prodotto-segnaposto.svg';

/** Prodotti consigliati per ciascun calcolatore (3 per calcolatore). */
export const PRODUCTS = {
  pittura: [
    {
      name: 'Idropittura lavabile per interni',
      description: 'Pittura traspirante e lavabile, adatta a soggiorni, camere e corridoi.',
      query: 'idropittura lavabile per interni',
    },
    {
      name: 'Kit rullo con vaschetta e prolunga',
      description: 'Rullo in microfibra, vaschetta e asta telescopica per pareti e soffitti.',
      query: 'kit rullo pittura con vaschetta e prolunga',
    },
    {
      name: 'Nastro di carta e teli di protezione',
      description: 'Per bordi puliti e per proteggere pavimenti, mobili e infissi.',
      query: 'nastro carta pittore telo protezione',
    },
  ],
  piastrelle: [
    {
      name: 'Tagliapiastrelle manuale',
      description: 'Taglio dritto e preciso di ceramica e gres porcellanato.',
      query: 'tagliapiastrelle manuale gres',
    },
    {
      name: 'Sistema livellante per piastrelle',
      description: 'Distanziatori e cunei per una posa in piano, senza dislivelli tra i bordi.',
      query: 'sistema livellante piastrelle distanziatori',
    },
    {
      name: 'Spatola dentata e cazzuola',
      description: 'Per stendere l’adesivo in modo uniforme, con la dentatura giusta per il formato.',
      query: 'spatola dentata piastrelle cazzuola',
    },
  ],
  cartongesso: [
    {
      name: 'Avvitatore per cartongesso',
      description: 'Con finecorsa di profondità: la vite entra sempre alla misura giusta.',
      query: 'avvitatore per cartongesso',
    },
    {
      name: 'Viti autoperforanti per cartongesso',
      description: 'Viti fosfatate per fissare le lastre ai profili metallici.',
      query: 'viti cartongesso 25 mm autoperforanti',
    },
    {
      name: 'Stucco e nastro per giunti',
      description: 'Per chiudere i giunti tra le lastre e ottenere una superficie liscia.',
      query: 'stucco per cartongesso nastro giunti',
    },
  ],
  parquet: [
    {
      name: 'Materassino sottopavimento',
      description: 'Isola dal rumore da calpestio e compensa piccole irregolarità del fondo.',
      query: 'materassino sottopavimento parquet flottante',
    },
    {
      name: 'Kit di posa per parquet e laminato',
      description: 'Tampone, tirante e distanziatori per incastri precisi e giunti perimetrali.',
      query: 'kit posa parquet laminato tirante',
    },
    {
      name: 'Battiscopa in legno',
      description: 'Rifinisce il perimetro e copre il giunto di dilatazione lungo le pareti.',
      query: 'battiscopa in legno',
    },
  ],
} satisfies Record<string, Product[]>;

export type ProductGroupId = keyof typeof PRODUCTS;

/** Costruisce il link affiliato Amazon di un prodotto. */
export function productUrl(product: Product): string {
  if (product.url) return product.url;
  const tag = encodeURIComponent(AMAZON_TAG);
  if (product.asin) return `${AMAZON_BASE}/dp/${encodeURIComponent(product.asin)}?tag=${tag}`;
  return `${AMAZON_BASE}/s?k=${encodeURIComponent(product.query)}&tag=${tag}`;
}
