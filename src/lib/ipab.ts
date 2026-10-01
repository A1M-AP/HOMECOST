/**
 * Indice ISTAT dei prezzi delle abitazioni esistenti (IPAB) per area e grandi città.
 * Serve a portare le quotazioni OMI di un semestre passato all'ultimo trimestre disponibile.
 *
 * File: public/data/ipab.json → { "_aggiornato": "AAAA-MM-GG", "NO": { "2018-Q3": 101.2, ... }, ... }
 */

export const IPAB_AREE = {
  NO: 'Nord-ovest',
  NE: 'Nord-est',
  CE: 'Centro',
  SI: 'Sud e Isole',
  ROMA: 'Roma',
  MILANO: 'Milano',
  TORINO: 'Torino',
} as const;

export type IpabArea = keyof typeof IPAB_AREE;

const Q_RE = /^(\d{4})-Q([1-4])$/;

export interface IpabData {
  aggiornato: string | null;
  serie: Partial<Record<IpabArea, Record<string, number>>>;
}

export function parseIpab(raw: unknown): IpabData {
  const out: IpabData = { aggiornato: null, serie: {} };
  if (!raw || typeof raw !== 'object') return out;
  const obj = raw as Record<string, unknown>;
  if (typeof obj._aggiornato === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(obj._aggiornato)) out.aggiornato = obj._aggiornato;
  for (const area of Object.keys(IPAB_AREE) as IpabArea[]) {
    const s = obj[area];
    if (!s || typeof s !== 'object') continue;
    const clean: Record<string, number> = {};
    for (const [k, v] of Object.entries(s as Record<string, unknown>)) {
      if (Q_RE.test(k) && typeof v === 'number' && v > 0) clean[k] = v;
    }
    if (Object.keys(clean).length) out.serie[area] = clean;
  }
  return out;
}

/** "2018-2" (semestre OMI) → ["2018-Q3", "2018-Q4"] */
export function semesterQuarters(semestre: string): [string, string] {
  const [y, s] = semestre.split('-').map(Number);
  return s === 1 ? [`${y}-Q1`, `${y}-Q2`] : [`${y}-Q3`, `${y}-Q4`];
}

/** "2026-Q2" → "2° trimestre 2026" */
export function formatQuarter(q: string): string {
  const m = Q_RE.exec(q);
  return m ? `${m[2]}° trimestre ${m[1]}` : q;
}

/** "2018-2" → "2° semestre 2018" */
export function formatSemester(s: string): string {
  const [y, n] = s.split('-');
  return `${n}° semestre ${y}`;
}

export interface IpabFactors {
  /** Coefficiente per area (1 se i dati mancano). */
  factors: Record<IpabArea, number>;
  /** Ultimo trimestre usato, null se non disponibile. */
  to: string | null;
}

/**
 * Coefficiente = indice dell'ultimo trimestre ÷ media dei due trimestri del semestre OMI.
 * Usa per tutte le aree lo stesso ultimo trimestre comune, così le stime sono confrontabili.
 */
export function ipabFactors(data: IpabData, semestre: string): IpabFactors {
  const [q1, q2] = semesterQuarters(semestre);
  const areas = Object.keys(IPAB_AREE) as IpabArea[];
  const lastCommon = areas
    .map((a) => Object.keys(data.serie[a] ?? {}).sort().at(-1))
    .filter((x): x is string => !!x)
    .sort()[0];
  const factors = {} as Record<IpabArea, number>;
  let used = false;
  for (const a of areas) {
    const s = data.serie[a];
    const base = s && s[q1] && s[q2] ? (s[q1] + s[q2]) / 2 : null;
    const last = s && lastCommon ? s[lastCommon] : null;
    if (base && last && lastCommon! > q2) {
      factors[a] = last / base;
      used = true;
    } else factors[a] = 1;
  }
  // Le città senza serie propria usano quella della loro area
  if (factors.ROMA === 1 && !data.serie.ROMA) factors.ROMA = factors.CE;
  if (factors.MILANO === 1 && !data.serie.MILANO) factors.MILANO = factors.NO;
  if (factors.TORINO === 1 && !data.serie.TORINO) factors.TORINO = factors.NO;
  return { factors, to: used ? lastCommon! : null };
}
