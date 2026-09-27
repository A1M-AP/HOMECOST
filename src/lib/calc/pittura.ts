/**
 * Quantità di pittura per una stanza.
 *
 * superficie = pareti (perimetro × altezza − porte − finestre) + soffitto (facoltativo)
 * litri = superficie × mani ÷ resa × (1 + scarto)
 */
import { euro, fmt, plural } from '../format.ts';
import { ceilSafe, withWaste, type CalcOutcome, type Presentation } from './utils.ts';

export const CAN_SIZES = [2.5, 5, 10] as const;
export type CanSize = (typeof CAN_SIZES)[number];

export interface PitturaInput {
  lunghezza: number;
  larghezza: number;
  altezza: number;
  porteN: number;
  porteLarghezza: number;
  porteAltezza: number;
  finestreN: number;
  finestreLarghezza: number;
  finestreAltezza: number;
  soffitto: boolean;
  mani: number;
  /** Resa in m² per litro per una mano. */
  resa: number;
  /** Scarto in percentuale. */
  scarto: number;
  /** Prezzi dei barattoli (facoltativi): se presenti tutti, si cerca la combinazione più economica. */
  prezzi?: Partial<Record<CanSize, number>>;
}

export interface CanCombo {
  /** Numero di barattoli per formato. */
  cans: Record<CanSize, number>;
  litri: number;
  pezzi: number;
  costo: number | null;
}

export interface PitturaResult {
  pareti: number;
  aperture: number;
  soffitto: number;
  superficie: number;
  litriNetti: number;
  litri: number;
  perFormato: { size: CanSize; pezzi: number; litri: number }[];
  migliore: CanCombo;
  criterio: 'prezzo' | 'spreco';
}

export function calcPittura(i: PitturaInput): CalcOutcome<PitturaResult> {
  const pareteLorda = 2 * (i.lunghezza + i.larghezza) * i.altezza;
  const aperture =
    i.porteN * i.porteLarghezza * i.porteAltezza + i.finestreN * i.finestreLarghezza * i.finestreAltezza;

  const errors: Record<string, string> = {};
  if (i.porteN > 0 && i.porteAltezza > i.altezza) errors.porteAltezza = 'La porta è più alta della parete.';
  if (i.finestreN > 0 && i.finestreAltezza > i.altezza) errors.finestreAltezza = 'La finestra è più alta della parete.';
  if (aperture >= pareteLorda) {
    errors.porteN = 'Porte e finestre superano la superficie delle pareti: controlla le misure.';
  }
  if (Object.keys(errors).length) return { ok: false, errors };

  const pareti = pareteLorda - aperture;
  const soffitto = i.soffitto ? i.lunghezza * i.larghezza : 0;
  const superficie = pareti + soffitto;
  const litriNetti = (superficie * i.mani) / i.resa;
  const litri = withWaste(litriNetti, i.scarto);

  const perFormato = CAN_SIZES.map((size) => {
    const pezzi = ceilSafe(litri / size);
    return { size, pezzi, litri: pezzi * size };
  });

  const prezzi = i.prezzi;
  const conPrezzi = !!prezzi && CAN_SIZES.every((s) => typeof prezzi[s] === 'number' && prezzi[s]! > 0);

  return {
    ok: true,
    result: {
      pareti,
      aperture,
      soffitto,
      superficie,
      litriNetti,
      litri,
      perFormato,
      migliore: bestCombo(litri, conPrezzi ? (prezzi as Record<CanSize, number>) : undefined),
      criterio: conPrezzi ? 'prezzo' : 'spreco',
    },
  };
}

/**
 * Trova la combinazione di barattoli da 2,5 / 5 / 10 L che copre il fabbisogno.
 * - Con i prezzi: la più economica (a parità, meno litri e meno barattoli).
 * - Senza prezzi: quella con meno pittura avanzata; a parità, meno barattoli
 *   (i formati grandi costano meno al litro).
 */
export function bestCombo(litri: number, prezzi?: Record<CanSize, number>): CanCombo {
  let best: CanCombo | null = null;
  const max10 = Math.max(0, ceilSafe(litri / 10));

  for (let n10 = 0; n10 <= max10; n10++) {
    const rest10 = litri - n10 * 10;
    const max5 = rest10 > 0 ? ceilSafe(rest10 / 5) : 0;
    for (let n5 = 0; n5 <= max5; n5++) {
      const rest5 = rest10 - n5 * 5;
      const n25 = rest5 > 0 ? ceilSafe(rest5 / 2.5) : 0;
      const combo: CanCombo = {
        cans: { 2.5: n25, 5: n5, 10: n10 },
        litri: n25 * 2.5 + n5 * 5 + n10 * 10,
        pezzi: n25 + n5 + n10,
        costo: prezzi ? n25 * prezzi[2.5] + n5 * prezzi[5] + n10 * prezzi[10] : null,
      };
      if (!best || isBetter(combo, best)) best = combo;
    }
  }
  return best!;
}

function isBetter(a: CanCombo, b: CanCombo): boolean {
  const eps = 1e-9;
  if (a.costo !== null && b.costo !== null && Math.abs(a.costo - b.costo) > eps) return a.costo < b.costo;
  if (Math.abs(a.litri - b.litri) > eps) return a.litri < b.litri;
  return a.pezzi < b.pezzi;
}

export function describeCombo(c: CanCombo): string {
  const parts = ([10, 5, 2.5] as CanSize[])
    .filter((s) => c.cans[s] > 0)
    .map((s) => `${c.cans[s]} × ${fmt(s, 1)} L`);
  return parts.join(' + ');
}

export function presentPittura(i: PitturaInput, r: PitturaResult): Presentation {
  const text: Record<string, string> = {
    superficie: `${fmt(r.superficie, 2)} m²`,
    pareti: `${fmt(r.pareti, 2)} m²`,
    aperture: `${fmt(r.aperture, 2)} m²`,
    soffitto: `${fmt(r.soffitto, 2)} m²`,
    litri: `${fmt(r.litri, 1)} litri`,
    litriNetti: `${fmt(r.litriNetti, 1)} L`,
    mani: plural(i.mani, 'mano', 'mani'),
    combo: describeCombo(r.migliore),
    comboLitri: `${fmt(r.migliore.litri, 1)} L acquistati, ${fmt(r.migliore.litri - r.litri, 1)} L di margine`,
    comboCosto: r.migliore.costo !== null ? euro(r.migliore.costo) : '',
    criterio:
      r.criterio === 'prezzo'
        ? 'la più economica in base ai prezzi che hai inserito'
        : 'quella con meno pittura avanzata e meno barattoli',
  };
  for (const f of r.perFormato) {
    const key = `can${String(f.size).replace('.', '')}`;
    text[key] = `${plural(f.pezzi, 'barattolo', 'barattoli')} (${fmt(f.litri, 1)} L)`;
  }
  return { text, flags: { soffitto: i.soffitto, aperture: r.aperture > 0, prezzi: r.criterio === 'prezzo' } };
}

export function summaryPittura(i: PitturaInput, r: PitturaResult): string {
  return [
    `Stanza: ${fmt(i.lunghezza)} × ${fmt(i.larghezza)} m, altezza ${fmt(i.altezza)} m${i.soffitto ? ', soffitto incluso' : ''}`,
    `Porte: ${i.porteN} – finestre: ${i.finestreN} – ${plural(i.mani, 'mano', 'mani')} – resa ${fmt(i.resa, 1)} m²/L – scarto ${fmt(i.scarto, 1)}%`,
    `Superficie da pitturare: ${fmt(r.superficie, 2)} m²`,
    `Pittura necessaria: ${fmt(r.litri, 1)} litri`,
    ...r.perFormato.map((f) => `Solo barattoli da ${fmt(f.size, 1)} L: ${f.pezzi}`),
    `Combinazione consigliata: ${describeCombo(r.migliore)}${r.migliore.costo !== null ? ` (${euro(r.migliore.costo)})` : ''}`,
  ].join('\n');
}
