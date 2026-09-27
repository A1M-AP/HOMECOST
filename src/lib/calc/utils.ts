/** Tolleranza per evitare errori di arrotondamento (es. 7,5 / 2,5 = 3,0000000001). */
const EPS = 1e-9;

/** Arrotonda per eccesso ignorando i residui dovuti alla virgola mobile. */
export function ceilSafe(value: number): number {
  return Math.ceil(value - EPS);
}

/** Arrotonda a un numero di decimali (arrotondamento commerciale). */
export function round(value: number, decimals = 2): number {
  const f = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * f) / f;
}

/** Aggiunge una percentuale di scarto: withWaste(10, 15) = 11,5. */
export function withWaste(value: number, wastePct: number): number {
  return value * (1 + wastePct / 100);
}

/** Esito di un calcolo: risultato oppure errori associati ai campi. */
export type CalcOutcome<R> =
  | { ok: true; result: R }
  | { ok: false; errors: Record<string, string> };

/** Testi e condizioni da mostrare nel riquadro del risultato. */
export interface Presentation {
  /** Valori per gli elementi `[data-out="chiave"]`. */
  text: Record<string, string>;
  /** Condizioni per gli elementi `[data-show="chiave"]` (visibili se true). */
  flags?: Record<string, boolean>;
}
