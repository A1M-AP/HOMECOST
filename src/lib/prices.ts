/**
 * Rivalutazione dei prezzi base con gli indici ISTAT dei prezzi al consumo.
 *
 * prezzo aggiornato = prezzo base × (indice ultimo mese ÷ indice mese dei prezzi base)
 *
 * Ogni gruppo di prezzi usa l'indice della sua voce di spesa (elettricità, materiali per la casa,
 * servizi di manutenzione); se quell'indice non copre il periodo si usa l'indice generale FOI.
 */
import { round } from './calc/utils.ts';
import { formatMonthKey, type IstatData } from './calc/istat.ts';
import { fmt } from './format.ts';
import type { PriceCategory } from '../config/prices.ts';

/** Nomi delle voci di spesa ISTAT, come compaiono nelle note dei calcolatori. */
export const CATEGORY_LABELS: Record<PriceCategory, string> = {
  elettricita: 'energia elettrica',
  materiali: 'materiali per la manutenzione della casa',
  manodopera: 'servizi di manutenzione della casa',
};

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export interface PriceIndices {
  aggiornato: string | null;
  serie: Partial<Record<PriceCategory, Record<string, number>>>;
}

/** Legge public/data/istat-prezzi.json: { "_aggiornato": "...", "materiali": { "2026-01": 100.4, ... }, ... } */
export function parsePriceIndices(raw: unknown): PriceIndices {
  const out: PriceIndices = { aggiornato: null, serie: {} };
  if (!raw || typeof raw !== 'object') return out;
  const obj = raw as Record<string, unknown>;
  if (typeof obj._aggiornato === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(obj._aggiornato)) out.aggiornato = obj._aggiornato;
  for (const cat of Object.keys(CATEGORY_LABELS) as PriceCategory[]) {
    const s = obj[cat];
    if (!s || typeof s !== 'object') continue;
    const clean: Record<string, number> = {};
    for (const [k, v] of Object.entries(s as Record<string, unknown>)) {
      if (MONTH_RE.test(k) && typeof v === 'number' && v > 0) clean[k] = v;
    }
    if (Object.keys(clean).length) out.serie[cat] = clean;
  }
  return out;
}

export interface Revaluation {
  /** Coefficiente da applicare ai prezzi base (1 = nessuna rivalutazione). */
  factor: number;
  baseMonth: string;
  /** Ultimo mese usato per la rivalutazione, null se non disponibile. */
  toMonth: string | null;
  /** Indice usato: quello della voce di spesa o quello generale FOI. */
  source?: 'voce' | 'generale';
}

/** Rivalutazione da una serie mensile { "AAAA-MM": indice }. */
export function revaluationFromSeries(indici: Record<string, number>, baseMonth: string): Revaluation {
  const base = indici[baseMonth];
  const last = Object.keys(indici).sort().at(-1) ?? null;
  if (!base || !last || last <= baseMonth) return { factor: 1, baseMonth, toMonth: null };
  return { factor: indici[last] / base, baseMonth, toMonth: last };
}

/** Rivalutazione con l'indice generale FOI. */
export function revaluation(data: IstatData, baseMonth: string): Revaluation {
  return revaluationFromSeries(data.indici, baseMonth);
}

/**
 * Rivalutazione di una voce di spesa: indice della voce se contiene il mese base,
 * altrimenti indice generale FOI.
 */
export function categoryRevaluation(
  cat: PriceCategory,
  indices: PriceIndices,
  foi: IstatData,
  baseMonth: string,
): Revaluation {
  const serie = indices.serie[cat];
  if (serie?.[baseMonth]) return { ...revaluationFromSeries(serie, baseMonth), source: 'voce' };
  return { ...revaluation(foi, baseMonth), source: 'generale' };
}

/** Applica il coefficiente a tutti i numeri di un oggetto (anche annidato), arrotondando. */
export function revalue<T>(prices: T, factor: number, decimals = 2): T {
  if (typeof prices === 'number') return round(prices * factor, decimals) as T;
  if (prices && typeof prices === 'object') {
    return Object.fromEntries(
      Object.entries(prices as Record<string, unknown>).map(([k, v]) => [k, revalue(v, factor, decimals)]),
    ) as T;
  }
  return prices;
}

function signedPct(factor: number): string {
  const pct = (factor - 1) * 100;
  const sign = pct > 0.05 ? '+' : pct < -0.05 ? '−' : '';
  return `${sign}${fmt(Math.abs(pct), 1)}%`;
}

/** Frase da mostrare vicino ai prezzi (indice generale FOI). */
export function describeRevaluation(r: Revaluation): string {
  const base = formatMonthKey(r.baseMonth);
  if (!r.toMonth) {
    return `Prezzi medi indicativi di ${base}: vengono aggiornati in automatico con l’indice ISTAT FOI appena sono disponibili i nuovi dati.`;
  }
  return `Prezzi medi indicativi di ${base}, aggiornati con l’indice ISTAT FOI a ${formatMonthKey(r.toMonth)} (${signedPct(r.factor)}).`;
}

/** Frase per uno o più gruppi di prezzi rivalutati con gli indici delle loro voci di spesa. */
export function describeCategories(entries: [PriceCategory, Revaluation][]): string {
  if (!entries.length) return '';
  const base = formatMonthKey(entries[0][1].baseMonth);
  const done = entries.filter(([, r]) => r.toMonth);
  if (!done.length) {
    return `Prezzi medi indicativi di ${base}: si aggiornano da soli con gli indici ISTAT dei prezzi al consumo appena escono i nuovi dati.`;
  }
  const parts = done.map(([cat, r]) =>
    r.source === 'voce' ? `${CATEGORY_LABELS[cat]} ${signedPct(r.factor)}` : `${CATEGORY_LABELS[cat]} ${signedPct(r.factor)} (indice generale FOI)`,
  );
  const to = done.map(([, r]) => r.toMonth!).sort().at(-1)!;
  return `Prezzi medi indicativi di ${base}, aggiornati con gli indici ISTAT dei prezzi al consumo a ${formatMonthKey(to)}: ${parts.join(', ')}.`;
}
