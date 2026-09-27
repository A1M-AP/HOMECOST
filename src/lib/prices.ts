/**
 * Rivalutazione dei prezzi base con la variazione dell'indice ISTAT FOI.
 *
 * prezzo aggiornato = prezzo base × (indice ultimo mese ÷ indice mese dei prezzi base)
 */
import { round } from './calc/utils.ts';
import { formatMonthKey, type IstatData } from './calc/istat.ts';
import { fmt } from './format.ts';

export interface Revaluation {
  /** Coefficiente da applicare ai prezzi base (1 = nessuna rivalutazione). */
  factor: number;
  baseMonth: string;
  /** Ultimo mese usato per la rivalutazione, null se non disponibile. */
  toMonth: string | null;
}

export function revaluation(data: IstatData, baseMonth: string): Revaluation {
  const base = data.indici[baseMonth];
  const last = data.ultimoMese;
  if (!base || !last || last <= baseMonth) return { factor: 1, baseMonth, toMonth: null };
  return { factor: data.indici[last] / base, baseMonth, toMonth: last };
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

/** Frase da mostrare vicino ai prezzi. */
export function describeRevaluation(r: Revaluation): string {
  const base = formatMonthKey(r.baseMonth);
  if (!r.toMonth) {
    return `Prezzi medi indicativi di ${base}: vengono aggiornati in automatico con l’indice ISTAT FOI appena sono disponibili i nuovi dati.`;
  }
  const pct = (r.factor - 1) * 100;
  const sign = pct > 0 ? '+' : pct < 0 ? '−' : '';
  return `Prezzi medi indicativi di ${base}, aggiornati con l’indice ISTAT FOI a ${formatMonthKey(r.toMonth)} (${sign}${fmt(Math.abs(pct), 1)}%).`;
}
