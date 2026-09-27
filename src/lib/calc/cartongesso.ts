/**
 * Stima dei materiali per una parete o controparete in cartongesso.
 * Valori indicativi: i sistemi dei produttori possono prevedere quantità diverse.
 */
import { fmt, int } from '../format.ts';
import { ceilSafe, withWaste, type CalcOutcome, type Presentation } from './utils.ts';

/** Larghezza standard delle lastre (m). */
export const BOARD_WIDTH = 1.2;
/** Altezze delle lastre disponibili nel calcolatore (m). */
export const BOARD_HEIGHTS = [2, 2.5, 3] as const;
/** Lunghezza commerciale di guide e montanti (m). */
export const PROFILE_LENGTH = 3;
/** Viti per m² per la lastra a vista e per quella sottostante (doppia lastra). */
export const SCREWS_PER_M2_OUTER = 15;
export const SCREWS_PER_M2_INNER = 8;
/** Distanza tra i tasselli che fissano le guide a pavimento e soffitto (m). */
export const ANCHOR_SPACING = 0.5;

export interface CartongessoInput {
  lunghezza: number;
  altezza: number;
  /** 1 = controparete (un lato), 2 = tramezzo (due lati). */
  lati: 1 | 2;
  /** Lastre sovrapposte per lato: 1 o 2. */
  strati: 1 | 2;
  /** Altezza della lastra in metri (2, 2,5 o 3). */
  altezzaLastra: number;
  /** Interasse dei montanti in cm. */
  interasse: number;
  /** Superficie di porte o aperture da escludere (m²). */
  aperture: number;
  scarto: number;
}

export interface CartongessoResult {
  areaParete: number;
  areaRivestita: number;
  lastre: number;
  guideMetri: number;
  guideBarre: number;
  montanti: number;
  montantiMetri: number;
  montantiOltreBarra: boolean;
  viti: number;
  tasselli: number;
  lastraPiuAltaDellaParete: boolean;
  lastraPiuBassaDellaParete: boolean;
}

export function calcCartongesso(i: CartongessoInput): CalcOutcome<CartongessoResult> {
  const areaLorda = i.lunghezza * i.altezza;
  if (i.aperture >= areaLorda) {
    return { ok: false, errors: { aperture: 'Le aperture non possono superare la superficie della parete.' } };
  }
  const areaParete = areaLorda - i.aperture;

  // Ogni lastra copre 1,2 m × l'altezza utile: se la lastra è più alta della parete,
  // il pezzo che avanza in cima di solito non è riutilizzabile.
  const copertura = BOARD_WIDTH * Math.min(i.altezzaLastra, i.altezza);
  const lastre = ceilSafe(withWaste((areaParete / copertura) * i.lati * i.strati, i.scarto));

  const guideMetri = withWaste(2 * i.lunghezza, i.scarto);
  const montantiNetti = ceilSafe((i.lunghezza * 100) / i.interasse) + 1;
  const montanti = ceilSafe(withWaste(montantiNetti, i.scarto));
  const vitiPerM2 = SCREWS_PER_M2_OUTER + (i.strati === 2 ? SCREWS_PER_M2_INNER : 0);
  const viti = Math.ceil(withWaste(areaParete * i.lati * vitiPerM2, i.scarto) / 10) * 10;

  return {
    ok: true,
    result: {
      areaParete,
      areaRivestita: areaParete * i.lati * i.strati,
      lastre,
      guideMetri,
      guideBarre: ceilSafe(guideMetri / PROFILE_LENGTH),
      montanti,
      montantiMetri: montanti * i.altezza,
      montantiOltreBarra: i.altezza > PROFILE_LENGTH,
      viti,
      tasselli: ceilSafe((2 * i.lunghezza) / ANCHOR_SPACING) + 2,
      lastraPiuAltaDellaParete: i.altezzaLastra > i.altezza + 1e-9,
      lastraPiuBassaDellaParete: i.altezza > i.altezzaLastra + 1e-9,
    },
  };
}

export function presentCartongesso(i: CartongessoInput, r: CartongessoResult): Presentation {
  return {
    text: {
      lastre: int(r.lastre),
      formato: `120 × ${fmt(i.altezzaLastra * 100, 0)} cm`,
      areaParete: `${fmt(r.areaParete, 2)} m²`,
      areaRivestita: `${fmt(r.areaRivestita, 2)} m²`,
      guideMetri: `${fmt(r.guideMetri, 1)} m`,
      guideBarre: `${int(r.guideBarre)} barre da 3 m`,
      montanti: int(r.montanti),
      montantiMetri: `${fmt(r.montantiMetri, 1)} m`,
      montanteAltezza: `${fmt(i.altezza, 2)} m`,
      viti: `circa ${int(r.viti)}`,
      tasselli: `circa ${int(r.tasselli)}`,
    },
    flags: {
      montantiOltreBarra: r.montantiOltreBarra,
      lastraPiuAlta: r.lastraPiuAltaDellaParete,
      lastraPiuBassa: r.lastraPiuBassaDellaParete,
    },
  };
}

export function summaryCartongesso(i: CartongessoInput, r: CartongessoResult): string {
  return [
    `Parete: ${fmt(i.lunghezza)} × ${fmt(i.altezza)} m – ${i.lati === 2 ? 'due lati' : 'un lato'} – ${i.strati === 2 ? 'doppia lastra' : 'lastra singola'} per lato`,
    `Lastre 120 × ${fmt(i.altezzaLastra * 100, 0)} cm – montanti ogni ${fmt(i.interasse, 0)} cm – scarto ${fmt(i.scarto, 1)}%`,
    `Lastre: ${int(r.lastre)}`,
    `Guide a U: ${fmt(r.guideMetri, 1)} m (${int(r.guideBarre)} barre da 3 m)`,
    `Montanti a C: ${int(r.montanti)} da ${fmt(i.altezza, 2)} m (${fmt(r.montantiMetri, 1)} m)`,
    `Viti per lastre: circa ${int(r.viti)} – tasselli per guide: circa ${int(r.tasselli)}`,
    'Stima indicativa: verifica le quantità con il sistema del produttore.',
  ].join('\n');
}
