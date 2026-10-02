/**
 * Quantità di piastrelle.
 *
 * m² con scarto = superficie × (1 + scarto)
 * piastrelle = m² con scarto ÷ (lato A × lato B)
 * scatole = m² con scarto ÷ m² per scatola (per eccesso)
 */
import { euro, fmt, int } from '../format.ts';
import { ceilSafe, laborCost, sumCosts, withWaste, type CalcOutcome, type Presentation } from './utils.ts';

/** Scarto consigliato per tipo di posa (%). */
export const TILE_WASTE = { dritta: 10, diagonale: 15 } as const;

export interface PiastrelleInput {
  superficie: number;
  /** Lati della piastrella in cm. */
  latoA: number;
  latoB: number;
  m2Scatola: number;
  scarto: number;
  /** Prezzo al m² (facoltativo): se presente si calcola la spesa stimata. */
  prezzoM2?: number | null;
  /** Manodopera per la posa, €/m² (facoltativa). */
  prezzoPosaM2?: number | null;
}

export interface PiastrelleResult {
  superficie: number;
  areaPiastrella: number;
  m2ConScarto: number;
  piastrelle: number;
  scatole: number;
  m2Acquistati: number;
  piastrellePerScatola: number;
  avanzo: number;
  /** Spesa stimata (scatole acquistate × prezzo al m²), null senza prezzo. */
  costo: number | null;
  /** Manodopera stimata (superficie × prezzo posa), null senza prezzo. */
  costoPosa: number | null;
  costoTotale: number | null;
}

export function calcPiastrelle(i: PiastrelleInput): CalcOutcome<PiastrelleResult> {
  const areaPiastrella = (i.latoA * i.latoB) / 10000;
  if (i.m2Scatola < areaPiastrella * 0.999) {
    return {
      ok: false,
      errors: { m2Scatola: 'Una scatola non può contenere meno di una piastrella: controlla i m² per scatola.' },
    };
  }
  const m2ConScarto = withWaste(i.superficie, i.scarto);
  const scatole = ceilSafe(m2ConScarto / i.m2Scatola);
  const m2Acquistati = scatole * i.m2Scatola;
  const costo = i.prezzoM2 ? m2Acquistati * i.prezzoM2 : null;
  const costoPosa = laborCost(i.superficie, i.prezzoPosaM2);
  return {
    ok: true,
    result: {
      superficie: i.superficie,
      areaPiastrella,
      m2ConScarto,
      piastrelle: ceilSafe(m2ConScarto / areaPiastrella),
      scatole,
      m2Acquistati,
      piastrellePerScatola: Math.max(1, Math.round(i.m2Scatola / areaPiastrella)),
      avanzo: m2Acquistati - m2ConScarto,
      costo,
      costoPosa,
      costoTotale: sumCosts(costo, costoPosa),
    },
  };
}

export function presentPiastrelle(i: PiastrelleInput, r: PiastrelleResult): Presentation {
  return {
    text: {
      piastrelle: int(r.piastrelle),
      scatole: int(r.scatole),
      superficie: `${fmt(r.superficie, 2)} m²`,
      m2ConScarto: `${fmt(r.m2ConScarto, 2)} m²`,
      m2Acquistati: `${fmt(r.m2Acquistati, 2)} m²`,
      avanzo: `${fmt(r.avanzo, 2)} m²`,
      areaPiastrella: `${fmt(r.areaPiastrella, 4)} m²`,
      formato: `${fmt(i.latoA, 1)} × ${fmt(i.latoB, 1)} cm`,
      perScatola: `circa ${int(r.piastrellePerScatola)}`,
      scarto: `${fmt(i.scarto, 1)}%`,
      costo: r.costo !== null ? euro(r.costo) : '',
      costoPosa: r.costoPosa !== null ? euro(r.costoPosa) : '',
      costoTotale: r.costoTotale !== null ? euro(r.costoTotale) : '',
    },
    flags: { costo: r.costo !== null, posa: r.costoPosa !== null },
  };
}

export function summaryPiastrelle(i: PiastrelleInput, r: PiastrelleResult): string {
  return [
    `Superficie: ${fmt(i.superficie, 2)} m² – piastrella ${fmt(i.latoA, 1)} × ${fmt(i.latoB, 1)} cm – ${fmt(i.m2Scatola, 3)} m² per scatola – scarto ${fmt(i.scarto, 1)}%`,
    `Superficie con scarto: ${fmt(r.m2ConScarto, 2)} m²`,
    `Piastrelle necessarie: ${int(r.piastrelle)}`,
    `Scatole da acquistare: ${int(r.scatole)} (${fmt(r.m2Acquistati, 2)} m²)`,
    r.costo !== null ? `Spesa stimata piastrelle: ${euro(r.costo)} (${euro(i.prezzoM2 ?? 0)}/m²)` : '',
    r.costoPosa !== null ? `Manodopera posa: ${euro(r.costoPosa)} (${euro(i.prezzoPosaM2 ?? 0)}/m²)` : '',
    r.costoPosa !== null && r.costoTotale !== null ? `Spesa totale con la posa: ${euro(r.costoTotale)}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}
