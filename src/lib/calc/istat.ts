/**
 * Rivalutazione ISTAT del canone d'affitto con l'indice FOI (senza tabacchi).
 *
 * variazione % = (indice mese di riferimento ÷ indice dello stesso mese dell'anno prima − 1) × 100
 * nuovo canone = canone × (1 + variazione × percentuale applicata)
 */
import { euro, fmt } from '../format.ts';
import { round, type CalcOutcome, type Presentation } from './utils.ts';

export const MONTHS = [
  'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre',
] as const;

export type ContractType = 'libero' | 'concordato' | 'transitorio' | 'commerciale';

export const CONTRACT_LABELS: Record<ContractType, string> = {
  libero: 'abitativo a canone libero (4+4)',
  concordato: 'abitativo a canone concordato (3+2)',
  transitorio: 'abitativo transitorio',
  commerciale: 'ad uso commerciale',
};

/** Percentuale proposta quando si sceglie il tipo di contratto. */
export const CONTRACT_DEFAULT_PERCENT: Record<ContractType, 75 | 100> = {
  libero: 100,
  concordato: 75,
  transitorio: 75,
  commerciale: 75,
};

const KEY_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** "2026-08" → "agosto 2026" */
export function formatMonthKey(key: string): string {
  const m = KEY_RE.exec(key);
  if (!m) return key;
  return `${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

/** Sposta un mese (1-12) di `delta` mesi. */
export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

export function monthsBetween(fromYear: number, fromMonth: number, toYear: number, toMonth: number): number {
  return (toYear - fromYear) * 12 + (toMonth - fromMonth);
}

export interface IstatData {
  /** Solo i mesi con un valore numerico valido. */
  indici: Record<string, number>;
  /** Valore della chiave "_aggiornato" (data dell'ultimo aggiornamento del file). */
  aggiornato: string | null;
  /** Mese più recente con un indice valido. */
  ultimoMese: string | null;
  /** Numero di mesi ancora segnaposto (valore non numerico). */
  segnaposto: number;
}

/**
 * Legge il file /data/istat-foi.json: { "AAAA-MM": valore }.
 * Le chiavi che iniziano con "_" sono metadati; i valori non numerici sono segnaposto.
 */
export function parseIstatData(raw: unknown): IstatData {
  const indici: Record<string, number> = {};
  let aggiornato: string | null = null;
  let segnaposto = 0;
  if (raw && typeof raw === 'object') {
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (key === '_aggiornato') {
        if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) aggiornato = value;
        continue;
      }
      if (!KEY_RE.test(key)) continue;
      const num = typeof value === 'number' ? value : NaN;
      if (Number.isFinite(num) && num > 0) indici[key] = num;
      else segnaposto++;
    }
  }
  const keys = Object.keys(indici).sort();
  return { indici, aggiornato, ultimoMese: keys.at(-1) ?? null, segnaposto };
}

export type VariazioneOutcome =
  | { ok: true; da: string; a: string; indiceDa: number; indiceA: number; variazione: number }
  | { ok: false; da: string; a: string; mancanti: string[] };

/**
 * Variazione percentuale dell'indice tra il mese indicato e lo stesso mese dell'anno prima,
 * arrotondata a un decimale come nelle tabelle ISTAT.
 */
export function variazioneDaIndici(indici: Record<string, number>, year: number, month: number): VariazioneOutcome {
  const a = monthKey(year, month);
  const da = monthKey(year - 1, month);
  const mancanti = [da, a].filter((k) => !(k in indici));
  if (mancanti.length) return { ok: false, da, a, mancanti };
  const indiceDa = indici[da];
  const indiceA = indici[a];
  return { ok: true, da, a, indiceDa, indiceA, variazione: round((indiceA / indiceDa - 1) * 100, 1) };
}

export interface CanoneInput {
  canone: number;
  /** Variazione ISTAT in punti percentuali (es. 1,6). */
  variazione: number;
  /** Quota della variazione da applicare: 75 o 100. */
  percentuale: 75 | 100;
  cedolare: boolean;
}

export interface CanoneResult {
  variazione: number;
  percentuale: number;
  /** Variazione effettivamente applicata al canone (%). */
  variazioneApplicata: number;
  aumentoMensile: number;
  aumentoAnnuo: number;
  nuovoCanone: number;
  /** Con la cedolare secca l'aggiornamento non è dovuto: il canone resta invariato. */
  bloccato: boolean;
}

export function calcCanone(i: CanoneInput): CanoneResult {
  const variazioneApplicata = (i.variazione * i.percentuale) / 100;
  const aumentoMensile = round((i.canone * variazioneApplicata) / 100, 2);
  return {
    variazione: i.variazione,
    percentuale: i.percentuale,
    variazioneApplicata,
    aumentoMensile,
    aumentoAnnuo: round(aumentoMensile * 12, 2),
    nuovoCanone: round(i.canone + aumentoMensile, 2),
    bloccato: i.cedolare,
  };
}

export interface DateCheckInput {
  inizioAnno: number;
  inizioMese: number;
  aggAnno: number;
  aggMese: number;
}

/** Controlla che l'aggiornamento cada almeno 12 mesi dopo la decorrenza. */
export function checkDates(i: DateCheckInput): CalcOutcome<{ mesi: number; annualita: number }> {
  const mesi = monthsBetween(i.inizioAnno, i.inizioMese, i.aggAnno, i.aggMese);
  if (mesi < 12) {
    return {
      ok: false,
      errors: {
        aggAnno: 'L’aggiornamento si applica dal primo anniversario: servono almeno 12 mesi dalla decorrenza.',
      },
    };
  }
  return { ok: true, result: { mesi, annualita: Math.floor(mesi / 12) + 1 } };
}

export interface WarningInput extends DateCheckInput {
  tipo: ContractType;
  percentuale: 75 | 100;
  cedolare: boolean;
  variazione: number | null;
}

/** Avvisi non bloccanti da mostrare sotto il risultato. */
export function istatWarnings(i: WarningInput): string[] {
  const out: string[] = [];
  const mesi = monthsBetween(i.inizioAnno, i.inizioMese, i.aggAnno, i.aggMese);

  if (i.cedolare) {
    out.push(
      'Con la cedolare secca il locatore rinuncia, per tutta la durata dell’opzione, a chiedere l’aggiornamento del canone, compreso quello ISTAT, anche se previsto dal contratto (art. 3, c. 11, D.Lgs. 23/2011). Il canone quindi non può essere aggiornato finché l’opzione è attiva.',
    );
    if (i.tipo === 'commerciale') {
      out.push(
        'La cedolare secca riguarda le locazioni abitative; per i negozi (categoria C/1) è stata ammessa solo per i contratti stipulati nel 2019. Verifica la tua situazione.',
      );
    }
  }
  if (i.inizioMese !== i.aggMese) {
    out.push(
      `Di solito l’aggiornamento scatta nel mese di anniversario del contratto (${MONTHS[i.inizioMese - 1]}): controlla la clausola del tuo contratto.`,
    );
  }
  if (i.tipo === 'commerciale' && i.percentuale === 100) {
    out.push(
      'Per le locazioni commerciali l’art. 32 della L. 392/1978 limita di norma l’aggiornamento al 75% della variazione ISTAT.',
    );
  }
  if (i.tipo === 'concordato' && i.percentuale === 100) {
    out.push(
      'Nei contratti a canone concordato l’aggiornamento previsto dal contratto tipo non può superare il 75% della variazione ISTAT.',
    );
  }
  if (i.tipo === 'transitorio' && mesi > 18) {
    out.push('Un contratto transitorio dura al massimo 18 mesi: verifica le date inserite.');
  }
  if (i.variazione !== null && i.variazione < 0) {
    out.push(
      'La variazione ISTAT è negativa: a seconda della clausola del contratto il canone può diminuire oppure restare invariato.',
    );
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Calcolo completo (usato dalla pagina e in fase di build)            */
/* ------------------------------------------------------------------ */

export interface IstatInput {
  canone: number;
  tipo: ContractType;
  inizioMese: number;
  inizioAnno: number;
  aggMese: number;
  aggAnno: number;
  /** Di quanti mesi il mese di riferimento dell'indice precede l'aggiornamento (0, 1 o 2). */
  anticipo: number;
  percentuale: 75 | 100;
  cedolare: boolean;
  /** Variazione inserita a mano; null = calcolata dagli indici FOI. */
  variazioneManuale: number | null;
}

export interface IstatResult {
  canone: CanoneResult;
  /** Mesi confrontati ("AAAA-MM"). */
  da: string;
  a: string;
  indiceDa: number | null;
  indiceA: number | null;
  annualita: number;
  avvisi: string[];
}

export function computeIstat(i: IstatInput, indici: Record<string, number>): CalcOutcome<IstatResult> {
  const dates = checkDates(i);
  if (!dates.ok) return dates;

  const ref = shiftMonth(i.aggAnno, i.aggMese, -i.anticipo);
  let variazione: number;
  let da = monthKey(ref.year - 1, ref.month);
  let a = monthKey(ref.year, ref.month);
  let indiceDa: number | null = null;
  let indiceA: number | null = null;

  if (i.variazioneManuale === null) {
    const v = variazioneDaIndici(indici, ref.year, ref.month);
    if (!v.ok) {
      const mesi = v.mancanti.map(formatMonthKey).join(' e ');
      return {
        ok: false,
        errors: {
          _indici: `L’indice FOI di ${mesi} non è ancora nell’archivio: scegli “Inserisco io la variazione” e inserisci il dato ISTAT.`,
        },
      };
    }
    ({ da, a, indiceDa, indiceA, variazione } = v);
  } else {
    variazione = i.variazioneManuale;
  }

  const canone = calcCanone({ canone: i.canone, variazione, percentuale: i.percentuale, cedolare: i.cedolare });
  return {
    ok: true,
    result: {
      canone,
      da,
      a,
      indiceDa,
      indiceA,
      annualita: dates.result.annualita,
      avvisi: istatWarnings({ ...i, variazione }),
    },
  };
}

export function signedPct(n: number, max = 3): string {
  const s = fmt(Math.abs(n), max);
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${s}%`;
}

export function presentIstat(i: IstatInput, r: IstatResult): Presentation {
  const c = r.canone;
  const bloccato = c.bloccato;
  return {
    text: {
      nuovoCanone: euro(bloccato ? i.canone : c.nuovoCanone),
      nuovoCanoneNota: bloccato ? 'invariato (cedolare secca)' : 'al mese',
      aumentoMensile: euro(bloccato ? 0 : c.aumentoMensile),
      aumentoNota: bloccato
        ? `teorico senza cedolare: ${euro(c.aumentoMensile)}`
        : `${euro(c.aumentoAnnuo)} all’anno`,
      variazione: signedPct(c.variazione, 1),
      periodo: `${formatMonthKey(r.da)} – ${formatMonthKey(r.a)}`,
      indici:
        r.indiceDa !== null && r.indiceA !== null
          ? `${fmt(r.indiceDa, 2)} → ${fmt(r.indiceA, 2)}`
          : 'variazione inserita a mano',
      percentuale: `${c.percentuale}%`,
      variazioneApplicata: signedPct(c.variazioneApplicata),
      aumentoAnnuo: euro(bloccato ? 0 : c.aumentoAnnuo),
      canoneAttuale: euro(i.canone),
      decorrenza: `${MONTHS[i.aggMese - 1]} ${i.aggAnno}`,
      annualita: `${r.annualita}ª annualità`,
    },
    flags: { avvisi: r.avvisi.length > 0, bloccato },
  };
}

export function summaryIstat(i: IstatInput, r: IstatResult): string {
  const c = r.canone;
  return [
    `Contratto ${CONTRACT_LABELS[i.tipo]} con decorrenza ${MONTHS[i.inizioMese - 1]} ${i.inizioAnno}`,
    `Aggiornamento da ${MONTHS[i.aggMese - 1]} ${i.aggAnno} – canone attuale ${euro(i.canone)}`,
    `Variazione ISTAT FOI (${formatMonthKey(r.da)} – ${formatMonthKey(r.a)}): ${signedPct(c.variazione, 1)}`,
    `Percentuale applicata: ${c.percentuale}% → ${signedPct(c.variazioneApplicata)}`,
    c.bloccato
      ? `Cedolare secca: canone invariato a ${euro(i.canone)} (aggiornamento teorico ${euro(c.aumentoMensile)}/mese)`
      : `Aumento: ${euro(c.aumentoMensile)} al mese, ${euro(c.aumentoAnnuo)} all’anno`,
    c.bloccato ? '' : `Nuovo canone mensile: ${euro(c.nuovoCanone)}`,
  ]
    .filter(Boolean)
    .join('\n');
}

/* ------------------------------------------------------------------ */
/* Lettera di comunicazione al conduttore                              */
/* ------------------------------------------------------------------ */

export interface LetterData {
  locatore: string;
  indirizzoLocatore: string;
  conduttore: string;
  immobile: string;
  estremi: string;
  luogo: string;
  /** Data della lettera già formattata (es. "27 settembre 2026"). */
  data: string;
  tipo: ContractType;
  inizioMese: number;
  inizioAnno: number;
  aggMese: number;
  aggAnno: number;
  /** Mesi confrontati, es. "agosto 2025 – agosto 2026". */
  periodo: string;
  canone: number;
  risultato: CanoneResult;
}

/** Testo della lettera: i campi lasciati vuoti diventano segnaposto tra parentesi quadre. */
export function buildLetter(d: LetterData): string {
  const or = (v: string, placeholder: string) => (v.trim() ? v.trim() : `[${placeholder}]`);
  const r = d.risultato;
  const locatore = or(d.locatore, 'Nome e cognome del locatore');
  const conduttore = or(d.conduttore, 'Nome e cognome del conduttore');
  const immobile = or(d.immobile, 'Indirizzo dell’immobile locato');
  const decorrenza = `${MONTHS[d.inizioMese - 1]} ${d.inizioAnno}`;
  const dal = `${MONTHS[d.aggMese - 1]} ${d.aggAnno}`;
  const diff = r.aumentoMensile;
  const voceDiff = diff < 0 ? 'Riduzione mensile' : 'Aumento mensile';

  return [
    locatore,
    or(d.indirizzoLocatore, 'Indirizzo del locatore'),
    '',
    `Gentile ${conduttore}`,
    immobile,
    '',
    `${or(d.luogo, 'Luogo')}, ${d.data}`,
    '',
    `Oggetto: aggiornamento ISTAT del canone di locazione – immobile in ${immobile}`,
    '',
    `Gentile ${conduttore},`,
    '',
    `con riferimento al contratto di locazione ${CONTRACT_LABELS[d.tipo]} con decorrenza da ${decorrenza}${d.estremi.trim() ? `, ${d.estremi.trim()}` : ''}, relativo all’immobile sito in ${immobile}, Le comunico l’aggiornamento annuale del canone previsto dal contratto, calcolato sulla base della variazione dell’indice ISTAT dei prezzi al consumo per le famiglie di operai e impiegati (FOI, senza tabacchi).`,
    '',
    `- Variazione dell’indice FOI (${d.periodo}): ${signedPct(r.variazione, 1)}`,
    `- Quota applicata: ${r.percentuale}% della variazione, pari a ${signedPct(r.variazioneApplicata)}`,
    `- Canone mensile attuale: ${euro(d.canone)}`,
    `- ${voceDiff}: ${euro(Math.abs(diff))}`,
    `- Nuovo canone mensile: ${euro(r.nuovoCanone)}`,
    '',
    `Il nuovo canone mensile di ${euro(r.nuovoCanone)} sarà dovuto a partire dalla mensilità di ${dal}.`,
    '',
    'Restando a disposizione per qualsiasi chiarimento, porgo cordiali saluti.',
    '',
    'Il locatore',
    locatore,
    '',
    '______________________________',
  ].join('\n');
}

/** Converte testo semplice in un documento RTF (apribile con Word, LibreOffice, Pages). */
export function toRtf(text: string): string {
  const body = text
    .replace(/\\/g, '\\\\')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/[^\x00-\x7f]/g, (c) => {
      const code = c.charCodeAt(0);
      return `\\u${code > 32767 ? code - 65536 : code}?`;
    })
    .replace(/\r?\n/g, '\\par\n');
  return `{\\rtf1\\ansi\\ansicpg1252\\deff0{\\fonttbl{\\f0\\fswiss Calibri;}}\\f0\\fs24\\sl276\\slmult1\n${body}\n}`;
}

/** "2026-09-15" → "15 settembre 2026" */
export function formatIsoDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

/** Frase sullo stato dell'archivio indici, mostrata nella pagina. */
export function describeData(d: IstatData): string {
  if (!d.ultimoMese) {
    return 'Archivio indici FOI in attesa dei dati ufficiali ISTAT: per ora inserisci tu la variazione percentuale.';
  }
  const agg = d.aggiornato ? `aggiornato il ${formatIsoDate(d.aggiornato)}` : 'data di aggiornamento non indicata';
  return `Archivio indici FOI ${agg}. Ultimo indice disponibile: ${formatMonthKey(d.ultimoMese)}.`;
}
