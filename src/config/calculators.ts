/**
 * Elenco dei calcolatori: alimenta menu, homepage, footer, link correlati e sitemap.
 */

export type CalculatorId = 'valore' | 'energia' | 'pittura' | 'piastrelle' | 'cartongesso' | 'parquet' | 'istat';

export interface CalculatorInfo {
  id: CalculatorId;
  path: string;
  /** Nome esteso (schede e link correlati). */
  name: string;
  /** Voce breve per il menu. */
  navLabel: string;
  /** Descrizione breve per le schede. */
  summary: string;
  /** Nome dell'icona in `src/components/Icon.astro`. */
  icon: CalculatorId;
  /** Colore d'accento di schede, icone e intestazione (vedi .accent-* in global.css). */
  accent: Accent;
  related: CalculatorId[];
}

export type Accent = 'violet' | 'amber' | 'rose' | 'blue' | 'cyan' | 'brown' | 'teal';

export const CALCULATORS: CalculatorInfo[] = [
  {
    id: 'valore',
    path: '/quanto-vale-la-mia-casa/',
    name: 'Quanto vale la mia casa',
    navLabel: 'Valore casa',
    summary: 'Stima del valore di mercato con le quotazioni OMI della tua zona, aggiornate con l’ISTAT.',
    icon: 'valore',
    accent: 'violet',
    related: ['istat', 'energia', 'pittura'],
  },
  {
    id: 'energia',
    path: '/consumo-elettrodomestici/',
    name: 'Costo in bolletta di un elettrodomestico',
    navLabel: 'Consumi',
    summary: 'Quanto ti costa ogni mese e ogni anno il forno, il condizionatore o la TV.',
    icon: 'energia',
    accent: 'amber',
    related: ['istat', 'pittura', 'parquet'],
  },
  {
    id: 'pittura',
    path: '/calcolo-pittura/',
    name: 'Calcolo pittura pareti',
    navLabel: 'Pittura',
    summary: 'Litri di pittura e barattoli da comprare per imbiancare una stanza.',
    icon: 'pittura',
    accent: 'rose',
    related: ['cartongesso', 'piastrelle', 'parquet'],
  },
  {
    id: 'piastrelle',
    path: '/calcolo-piastrelle/',
    name: 'Calcolo piastrelle',
    navLabel: 'Piastrelle',
    summary: 'Numero di piastrelle e scatole necessarie, con lo scarto giusto per la posa.',
    icon: 'piastrelle',
    accent: 'blue',
    related: ['parquet', 'pittura', 'cartongesso'],
  },
  {
    id: 'cartongesso',
    path: '/calcolo-cartongesso/',
    name: 'Calcolo cartongesso',
    navLabel: 'Cartongesso',
    summary: 'Lastre, guide, montanti e viti per una parete o una controparete.',
    icon: 'cartongesso',
    accent: 'cyan',
    related: ['pittura', 'piastrelle', 'parquet'],
  },
  {
    id: 'parquet',
    path: '/calcolo-parquet/',
    name: 'Calcolo parquet',
    navLabel: 'Parquet',
    summary: 'Confezioni di parquet e metri di battiscopa in base al tipo di posa.',
    icon: 'parquet',
    accent: 'brown',
    related: ['piastrelle', 'pittura', 'cartongesso'],
  },
  {
    id: 'istat',
    path: '/rivalutazione-istat-affitto/',
    name: 'Rivalutazione ISTAT dell’affitto',
    navLabel: 'Affitto ISTAT',
    summary: 'Aggiornamento del canone con l’indice FOI e lettera pronta per l’inquilino.',
    icon: 'istat',
    accent: 'teal',
    related: ['valore', 'energia', 'pittura'],
  },
];

export function getCalculator(id: CalculatorId): CalculatorInfo {
  const calc = CALCULATORS.find((c) => c.id === id);
  if (!calc) throw new Error(`Calcolatore sconosciuto: ${id}`);
  return calc;
}

/** Pagine istituzionali (footer e sitemap). */
export const INFO_PAGES = [
  { path: '/chi-siamo/', name: 'Chi siamo' },
  { path: '/contatti/', name: 'Contatti' },
];

export const LEGAL_PAGES = [
  { path: '/privacy-policy/', name: 'Privacy policy' },
  { path: '/cookie-policy/', name: 'Cookie policy' },
  { path: '/note-legali/', name: 'Note legali' },
];
