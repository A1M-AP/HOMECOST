/**
 * Stima del valore di mercato di un immobile residenziale.
 *
 * Metodo sintetico-comparativo:
 * 1. superficie commerciale (DPR 138/1998): superficie + quote di balconi, cantina e giardino;
 * 2. quotazione OMI della zona (€/m², minimo e massimo) per la tipologia scelta;
 * 3. coefficienti di merito: stato, piano, classe energetica;
 * 4. aggiornamento della quotazione al trimestre più recente con l'indice ISTAT dei prezzi
 *    delle abitazioni esistenti (IPAB) dell'area geografica o della città.
 */
import { euro, fmt, int } from '../format.ts';
import { round, type CalcOutcome, type Presentation } from './utils.ts';

export type Tipologia = 'civ' | 'eco' | 'sig' | 'vil';

export const TIPOLOGIE: Record<Tipologia, string> = {
  civ: 'Appartamento (abitazione civile)',
  eco: 'Appartamento di tipo economico',
  sig: 'Appartamento signorile',
  vil: 'Villa o villino',
};

export const STATI = {
  ristrutturare: { label: 'Da ristrutturare', k: 0.8 },
  abitabile: { label: 'Abitabile', k: 1 },
  ristrutturato: { label: 'Ristrutturato', k: 1.1 },
  nuovo: { label: 'Nuovo', k: 1.15 },
} as const;

export const PIANI = {
  terra: { label: 'Piano terra o rialzato', k: 0.95 },
  intermedio: { label: 'Piano intermedio con ascensore', k: 1 },
  alto: { label: 'Piano alto con ascensore', k: 1.05 },
  bassoSenza: { label: '1° o 2° piano senza ascensore', k: 0.97 },
  altoSenza: { label: '3° piano o oltre senza ascensore', k: 0.9 },
  attico: { label: 'Attico', k: 1.1 },
} as const;

export const CLASSI = {
  AB: { label: 'A o B', k: 1.05 },
  CD: { label: 'C o D', k: 1 },
  EF: { label: 'E o F', k: 0.97 },
  G: { label: 'G o non so', k: 0.94 },
} as const;

export type Stato = keyof typeof STATI;
export type Piano = keyof typeof PIANI;
export type Classe = keyof typeof CLASSI;

export interface SuperficiInput {
  /** Superficie dell'abitazione, muri compresi (m²). */
  superficie: number;
  balconi: number;
  cantina: number;
  giardino: number;
}

/**
 * Superficie commerciale secondo i criteri del DPR 138/1998 (allegato C):
 * balconi e terrazzi 30% fino a 25 m² e 10% oltre; cantine e soffitte 25%;
 * giardino 10% fino alla superficie dell'abitazione e 2% oltre.
 */
export function superficieCommerciale(i: SuperficiInput): number {
  const balconi = Math.min(i.balconi, 25) * 0.3 + Math.max(0, i.balconi - 25) * 0.1;
  const cantina = i.cantina * 0.25;
  const giardino = Math.min(i.giardino, i.superficie) * 0.1 + Math.max(0, i.giardino - i.superficie) * 0.02;
  return i.superficie + balconi + cantina + giardino;
}

export interface ValoreInput extends SuperficiInput {
  /** Quotazione OMI €/m² [minimo, massimo] della zona per la tipologia. */
  quotazione: [number, number];
  /** Quotazione OMI dei box €/m² (facoltativa). */
  quotazioneBox: [number, number] | null;
  box: number;
  tipologia: Tipologia;
  stato: Stato;
  /** Non considerato per le ville. */
  piano: Piano;
  classe: Classe;
  /** Coefficiente ISTAT IPAB dal semestre OMI all'ultimo trimestre disponibile. */
  rivalutazione: number;
}

export interface ValoreResult {
  superficieCommerciale: number;
  coefficiente: number;
  eurM2Min: number;
  eurM2Max: number;
  eurM2: number;
  valoreMin: number;
  valoreMax: number;
  valore: number;
  valoreBox: number | null;
  totale: number;
  totaleMin: number;
  totaleMax: number;
}

/** Arrotonda al migliaio: è una stima, i decimali darebbero una falsa precisione. */
export const toThousand = (n: number) => Math.round(n / 1000) * 1000;

export function calcValore(i: ValoreInput): CalcOutcome<ValoreResult> {
  const [qMin, qMax] = i.quotazione;
  if (!(qMin > 0 && qMax >= qMin)) {
    return { ok: false, errors: { _zona: 'Per questa zona non ci sono quotazioni della tipologia scelta: prova un’altra tipologia.' } };
  }
  const sc = superficieCommerciale(i);
  const coefficiente =
    STATI[i.stato].k * CLASSI[i.classe].k * (i.tipologia === 'vil' ? 1 : PIANI[i.piano].k);
  const f = coefficiente * i.rivalutazione;
  const eurM2Min = qMin * f;
  const eurM2Max = qMax * f;
  const eurM2 = (eurM2Min + eurM2Max) / 2;

  let valoreBox: number | null = null;
  if (i.box > 0 && i.quotazioneBox) {
    valoreBox = ((i.quotazioneBox[0] + i.quotazioneBox[1]) / 2) * i.rivalutazione * i.box;
  }
  const valoreMin = eurM2Min * sc;
  const valoreMax = eurM2Max * sc;
  const valore = eurM2 * sc;
  return {
    ok: true,
    result: {
      superficieCommerciale: round(sc, 2),
      coefficiente,
      eurM2Min,
      eurM2Max,
      eurM2,
      valoreMin,
      valoreMax,
      valore,
      valoreBox,
      totale: valore + (valoreBox ?? 0),
      totaleMin: valoreMin + (valoreBox ?? 0),
      totaleMax: valoreMax + (valoreBox ?? 0),
    },
  };
}

function pct(k: number): string {
  const p = (k - 1) * 100;
  if (Math.abs(p) < 0.05) return 'nessuna correzione';
  return `${p > 0 ? '+' : '−'}${fmt(Math.abs(p), 1)}%`;
}

export function presentValore(i: ValoreInput, r: ValoreResult): Presentation {
  return {
    text: {
      valore: euro(toThousand(r.totale)).replace(',00', ''),
      forchetta: `da ${euro(toThousand(r.totaleMin)).replace(',00', '')} a ${euro(toThousand(r.totaleMax)).replace(',00', '')}`,
      eurM2: `${int(Math.round(r.eurM2 / 10) * 10)} €/m²`,
      eurM2Range: `${int(Math.round(r.eurM2Min / 10) * 10)} – ${int(Math.round(r.eurM2Max / 10) * 10)} €/m²`,
      superficie: `${fmt(r.superficieCommerciale, 1)} m²`,
      quotazione: `${int(i.quotazione[0])} – ${int(i.quotazione[1])} €/m²`,
      coefficiente: pct(r.coefficiente),
      rivalutazione: pct(i.rivalutazione),
      valoreBox: r.valoreBox !== null ? euro(toThousand(r.valoreBox)).replace(',00', '') : '—',
      valoreAbitazione: euro(toThousand(r.valore)).replace(',00', ''),
    },
    flags: { box: r.valoreBox !== null },
  };
}

export function summaryValore(i: ValoreInput, r: ValoreResult, luogo: string): string {
  return [
    `Immobile: ${TIPOLOGIE[i.tipologia]} – ${luogo}`,
    `Superficie commerciale: ${fmt(r.superficieCommerciale, 1)} m² (abitazione ${fmt(i.superficie, 1)} m²)`,
    `Stato: ${STATI[i.stato].label} – classe energetica ${CLASSI[i.classe].label}${i.tipologia === 'vil' ? '' : ` – ${PIANI[i.piano].label}`}`,
    `Valore al m² stimato: ${int(Math.round(r.eurM2 / 10) * 10)} €/m²`,
    `Valore stimato: ${euro(toThousand(r.totale))} (da ${euro(toThousand(r.totaleMin))} a ${euro(toThousand(r.totaleMax))})`,
    r.valoreBox !== null ? `di cui box: ${euro(toThousand(r.valoreBox))}` : '',
    'Fonte quotazioni: Agenzia Entrate - OMI, aggiornate con l’indice ISTAT dei prezzi delle abitazioni.',
  ]
    .filter(Boolean)
    .join('\n');
}
