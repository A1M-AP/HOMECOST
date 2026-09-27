/**
 * Quantità di parquet e battiscopa.
 *
 * m² con scarto = superficie × (1 + scarto)
 * confezioni = m² con scarto ÷ m² per confezione (per eccesso)
 * battiscopa = (perimetro − larghezza porte) × (1 + 10%)
 */
import { euro, fmt, int } from '../format.ts';
import { ceilSafe, withWaste, type CalcOutcome, type Presentation } from './utils.ts';

/** Scarto consigliato per tipo di posa (%). */
export const PARQUET_WASTE = { dritta: 8, diagonale: 12, spina: 15 } as const;
/** Scarto per tagli e angoli del battiscopa (%). */
export const SKIRTING_WASTE = 10;
/** Lunghezza tipica di una barra di battiscopa (m). */
export const SKIRTING_BAR = 2.4;

/** Perimetro stimato di una stanza di cui si conosce solo la superficie (ipotesi: pianta quadrata). */
export function estimatePerimeter(area: number): number {
  return 4 * Math.sqrt(area);
}

export interface ParquetInput {
  superficie: number;
  m2Confezione: number;
  scarto: number;
  perimetro: number;
  /** Larghezza totale delle porte, dove il battiscopa non va posato (m). */
  porte: number;
  /** Prezzi facoltativi per la spesa stimata. */
  prezzoM2?: number | null;
  prezzoBattiscopa?: number | null;
}

export interface ParquetResult {
  m2ConScarto: number;
  confezioni: number;
  m2Acquistati: number;
  avanzo: number;
  perimetro: number;
  battiscopa: number;
  barreBattiscopa: number;
  /** Spesa stimata per parquet e battiscopa, null senza prezzi. */
  costoParquet: number | null;
  costoBattiscopa: number | null;
  costo: number | null;
}

export function calcParquet(i: ParquetInput): CalcOutcome<ParquetResult> {
  if (i.porte >= i.perimetro) {
    return { ok: false, errors: { porte: 'La larghezza delle porte supera il perimetro della stanza.' } };
  }
  const m2ConScarto = withWaste(i.superficie, i.scarto);
  const confezioni = ceilSafe(m2ConScarto / i.m2Confezione);
  const m2Acquistati = confezioni * i.m2Confezione;
  const battiscopa = withWaste(i.perimetro - i.porte, SKIRTING_WASTE);
  const barreBattiscopa = ceilSafe(battiscopa / SKIRTING_BAR);
  const costoParquet = i.prezzoM2 ? m2Acquistati * i.prezzoM2 : null;
  const costoBattiscopa = i.prezzoBattiscopa ? barreBattiscopa * SKIRTING_BAR * i.prezzoBattiscopa : null;
  const costo = costoParquet === null && costoBattiscopa === null ? null : (costoParquet ?? 0) + (costoBattiscopa ?? 0);
  return {
    ok: true,
    result: {
      m2ConScarto,
      confezioni,
      m2Acquistati,
      avanzo: m2Acquistati - m2ConScarto,
      perimetro: i.perimetro,
      battiscopa,
      barreBattiscopa,
      costoParquet,
      costoBattiscopa,
      costo,
    },
  };
}

export function presentParquet(i: ParquetInput, r: ParquetResult, perimetroStimato: boolean): Presentation {
  return {
    text: {
      confezioni: int(r.confezioni),
      m2ConScarto: `${fmt(r.m2ConScarto, 2)} m²`,
      m2Acquistati: `${fmt(r.m2Acquistati, 2)} m²`,
      avanzo: `${fmt(r.avanzo, 2)} m²`,
      superficie: `${fmt(i.superficie, 2)} m²`,
      scarto: `${fmt(i.scarto, 1)}%`,
      perimetro: `${fmt(r.perimetro, 2)} m`,
      battiscopa: `${fmt(r.battiscopa, 1)} m`,
      barre: `${int(r.barreBattiscopa)} barre da 2,4 m`,
      costo: r.costo !== null ? euro(r.costo) : '',
      costoParquet: r.costoParquet !== null ? euro(r.costoParquet) : '—',
      costoBattiscopa: r.costoBattiscopa !== null ? euro(r.costoBattiscopa) : '—',
    },
    flags: { perimetroStimato, costo: r.costo !== null },
  };
}

export function summaryParquet(i: ParquetInput, r: ParquetResult, perimetroStimato: boolean): string {
  return [
    `Superficie: ${fmt(i.superficie, 2)} m² – ${fmt(i.m2Confezione, 3)} m² per confezione – scarto ${fmt(i.scarto, 1)}%`,
    `Superficie con scarto: ${fmt(r.m2ConScarto, 2)} m²`,
    `Confezioni da acquistare: ${int(r.confezioni)} (${fmt(r.m2Acquistati, 2)} m²)`,
    `Battiscopa: ${fmt(r.battiscopa, 1)} m (${int(r.barreBattiscopa)} barre da 2,4 m)${perimetroStimato ? ' – perimetro stimato' : ''}`,
    r.costo !== null ? `Spesa stimata: ${euro(r.costo)}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}
