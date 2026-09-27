/**
 * Costo in bolletta di un elettrodomestico.
 *
 * kWh mensili = W × ore/giorno × giorni / 1000 (+ W standby × ore residue / 1000)
 * costo mensile = kWh mensili × €/kWh
 */
import { euro, fmt } from '../format.ts';
import type { Presentation } from './utils.ts';

/** Ore di un mese "standard" di 30 giorni, usato per lo standby. */
export const STANDARD_MONTH_HOURS = 720;

export interface EnergiaInput {
  /** Potenza media in funzionamento (W). */
  watt: number;
  oreGiorno: number;
  giorniMese: number;
  /** Prezzo tutto compreso in €/kWh. */
  prezzoKwh: number;
  /** Potenza in standby (W), 0 se l'apparecchio viene staccato. */
  standbyWatt?: number;
}

export interface EnergiaResult {
  kwhUso: number;
  oreStandby: number;
  kwhStandby: number;
  kwhMese: number;
  costoMese: number;
  kwhAnno: number;
  costoAnno: number;
  costoStandbyAnno: number;
  costoOraUso: number;
}

export function calcEnergia(input: EnergiaInput): EnergiaResult {
  const { watt, oreGiorno, giorniMese, prezzoKwh } = input;
  const standby = input.standbyWatt ?? 0;

  const oreUso = oreGiorno * giorniMese;
  const kwhUso = (watt * oreUso) / 1000;

  // Ore residue del mese in cui l'apparecchio resta collegato ma spento.
  const oreMese = Math.max(STANDARD_MONTH_HOURS, 24 * giorniMese);
  const oreStandby = standby > 0 ? Math.max(0, oreMese - oreUso) : 0;
  const kwhStandby = (standby * oreStandby) / 1000;

  const kwhMese = kwhUso + kwhStandby;
  const costoMese = kwhMese * prezzoKwh;

  return {
    kwhUso,
    oreStandby,
    kwhStandby,
    kwhMese,
    costoMese,
    kwhAnno: kwhMese * 12,
    costoAnno: costoMese * 12,
    costoStandbyAnno: kwhStandby * prezzoKwh * 12,
    costoOraUso: (watt / 1000) * prezzoKwh,
  };
}

export interface Appliance {
  id: string;
  label: string;
  watt: number;
  oreGiorno: number;
  giorniMese: number;
  standbyWatt: number;
  /** Suggerimento mostrato quando si seleziona l'apparecchio. */
  hint: string;
}

/**
 * Valori medi indicativi. Molti apparecchi non assorbono sempre la potenza di targa
 * (termostati, compressori, cicli di lavaggio): qui usiamo una potenza media realistica.
 */
export const APPLIANCES: Appliance[] = [
  { id: 'forno', label: 'Forno elettrico', watt: 1200, oreGiorno: 1, giorniMese: 8, standbyWatt: 1, hint: 'Potenza media con termostato: la targhetta indica spesso 2.000–3.000 W, ma la resistenza non resta sempre accesa.' },
  { id: 'lavatrice', label: 'Lavatrice', watt: 600, oreGiorno: 2, giorniMese: 12, standbyWatt: 0.5, hint: 'Media su un ciclo a 40 °C (circa 1 kWh in 2 ore). A 60–90 °C il consumo cresce molto.' },
  { id: 'asciugatrice', label: 'Asciugatrice', watt: 900, oreGiorno: 2, giorniMese: 8, standbyWatt: 0.5, hint: 'Valore tipico a pompa di calore. I modelli a resistenza arrivano a 2.000–2.500 W.' },
  { id: 'condizionatore', label: 'Condizionatore', watt: 800, oreGiorno: 6, giorniMese: 30, standbyWatt: 2, hint: 'Split inverter da 9.000–12.000 BTU in estate. Il consumo dipende da temperatura impostata e isolamento.' },
  { id: 'frigorifero', label: 'Frigorifero', watt: 35, oreGiorno: 24, giorniMese: 30, standbyWatt: 0, hint: 'Media sulle 24 ore: il compressore si accende e si spegne. Un modello recente consuma 200–300 kWh l’anno.' },
  { id: 'tv', label: 'Televisore', watt: 90, oreGiorno: 4, giorniMese: 30, standbyWatt: 0.5, hint: 'TV LED da 43–55 pollici. Gli schermi più grandi o molto luminosi consumano di più.' },
  { id: 'pc', label: 'Computer fisso', watt: 150, oreGiorno: 6, giorniMese: 22, standbyWatt: 2, hint: 'PC da ufficio con monitor. Un portatile consuma 30–60 W, un PC da gioco anche 400 W.' },
  { id: 'boiler', label: 'Boiler elettrico', watt: 1200, oreGiorno: 3, giorniMese: 30, standbyWatt: 0, hint: 'Ore effettive in cui la resistenza scalda l’acqua, non ore di accensione dell’interruttore.' },
  { id: 'stufa', label: 'Stufa elettrica', watt: 2000, oreGiorno: 3, giorniMese: 30, standbyWatt: 0, hint: 'Stufetta o termoventilatore alla massima potenza. Con il termostato il consumo medio scende.' },
  { id: 'induzione', label: 'Piano a induzione', watt: 1500, oreGiorno: 1, giorniMese: 30, standbyWatt: 1, hint: 'Media durante la cottura: i picchi arrivano a 3.000 W e oltre, ma per pochi minuti.' },
];

/** Importi piccoli (es. costo di un'ora) con tre decimali. */
function euroFine(n: number): string {
  return n < 1 ? `${fmt(n, 3, 2)} €` : euro(n);
}

export function presentEnergia(i: EnergiaInput, r: EnergiaResult): Presentation {
  return {
    text: {
      costoMese: euro(r.costoMese),
      costoAnno: euro(r.costoAnno),
      kwhMese: `${fmt(r.kwhMese, 1)} kWh`,
      kwhAnno: `${fmt(r.kwhAnno, 0)} kWh`,
      kwhUso: `${fmt(r.kwhUso, 2)} kWh`,
      kwhStandby: `${fmt(r.kwhStandby, 2)} kWh`,
      costoStandbyAnno: euro(r.costoStandbyAnno),
      costoOraUso: euroFine(r.costoOraUso),
      costoGiorno: euroFine(r.costoMese / Math.max(1, i.giorniMese)),
    },
    flags: { standby: r.kwhStandby > 0 },
  };
}

export function summaryEnergia(i: EnergiaInput, r: EnergiaResult, nome?: string): string {
  const lines = [
    `Apparecchio: ${nome || 'personalizzato'} – ${fmt(i.watt, 1)} W, ${fmt(i.oreGiorno, 2)} h/giorno, ${fmt(i.giorniMese, 0)} giorni/mese`,
    `Prezzo energia: ${fmt(i.prezzoKwh, 4)} €/kWh${i.standbyWatt ? ` – standby ${fmt(i.standbyWatt, 1)} W` : ''}`,
    `Consumo mensile: ${fmt(r.kwhMese, 1)} kWh${r.kwhStandby > 0 ? ` (di cui standby ${fmt(r.kwhStandby, 2)} kWh)` : ''}`,
    `Costo mensile: ${euro(r.costoMese)}`,
    `Consumo annuale: ${fmt(r.kwhAnno, 0)} kWh`,
    `Costo annuale: ${euro(r.costoAnno)}`,
  ];
  return lines.join('\n');
}
