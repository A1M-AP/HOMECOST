#!/usr/bin/env node
/**
 * Aggiorna con i dati ufficiali ISTAT:
 * - public/data/istat-foi.json: indici FOI senza tabacchi (affitti, prezzi dei materiali);
 * - public/data/ipab.json: indice dei prezzi delle abitazioni esistenti (IPAB) per area e grandi città,
 *   usato dal calcolatore "Quanto vale la mia casa";
 * - public/data/istat-prezzi.json: indici NIC per voce di spesa (elettricità, materiali e servizi per
 *   la manutenzione della casa), usati per aggiornare i prezzi e le stime di spesa dei calcolatori.
 *
 * Fonte: API SDMX dell'ISTAT (https://esploradati.istat.it/SDMXWS/rest).
 * - dal 2026: base 2025=100 (dataflow 169_748_DF_DCSP_FOI1B2025_1, tipo dato 101);
 * - 2016-2025: base 2015=100 (dataflow 169_748_DF_DCSP_FOI1B2025_2, tipo dato 55),
 *   riportati in base 2025 con il coefficiente di raccordo = media 2025 in base 2015 ÷ 100.
 *
 * Prima di scrivere il file, le variazioni annue calcolate vengono confrontate con quelle
 * pubblicate dall'ISTAT: se non coincidono (o se i dati sono incompleti) lo script termina
 * con errore e non modifica nulla.
 *
 * Uso:  node scripts/update-istat.mjs            aggiorna il file
 *       node scripts/update-istat.mjs --dry-run  mostra i dati senza scrivere
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const API = 'https://esploradati.istat.it/SDMXWS/rest';
const ACCEPT = 'application/vnd.sdmx.structurespecificdata+xml;version=2.1';
const FILE = fileURLToPath(new URL('../public/data/istat-foi.json', import.meta.url));
const IPAB_FILE = fileURLToPath(new URL('../public/data/ipab.json', import.meta.url));

// IPAB trimestrale base 2025=100, abitazioni esistenti; serie dal 2010 tutta nella stessa base
const FLOW_IPAB = 'IT1,143_497_DF_DCSP_IPAB_6,1.0';
/** Codice territoriale ISTAT → chiave usata dal sito (src/lib/ipab.ts). */
export const IPAB_AREE = {
  ITC: 'NO', // Nord-ovest
  ITD: 'NE', // Nord-est
  ITE: 'CE', // Centro
  ITFG: 'SI', // Sud e Isole (Mezzogiorno)
  ITE43: 'ROMA',
  ITC45: 'MILANO',
  ITC11: 'TORINO',
};
const IPAB_START = '2015-Q1';

// NIC mensile base 2025=100 per voce di spesa ECOICOP v2 (5 cifre), dal 2026
const FLOW_NIC = 'IT1,167_745_DF_DCSP_NIC1B2025_4,1.0';
const PREZZI_FILE = fileURLToPath(new URL('../public/data/istat-prezzi.json', import.meta.url));
/** Codice ECOICOP → voce usata dal sito (src/config/prices.ts). */
export const NIC_VOCI = {
  '04510': 'elettricita', // Elettricità
  '04311': 'materiali', // Prodotti per la manutenzione e la riparazione dell'abitazione
  '04320': 'manodopera', // Servizi per la manutenzione, la riparazione e la sicurezza dell'abitazione
};

const FLOW_NEW = 'IT1,169_748_DF_DCSP_FOI1B2025_1,1.0'; // base 2025, dal 2026
const FLOW_OLD = 'IT1,169_748_DF_DCSP_FOI1B2025_2,1.0'; // basi precedenti, fino al 2025
const KEY_NEW = 'M.IT.101.4.00ST'; // mensile, Italia, FOI base 2025, numeri indice, senza tabacchi
const KEY_NEW_YOY = 'M.IT.101.7.00ST'; // variazioni percentuali tendenziali ufficiali
const KEY_OLD = 'M.IT.55.4.00ST'; // FOI base 2015
const OLD_START = '2016-01';
const NEW_START = '2026-01';

/* --- Funzioni pure (testate in tests/update-istat.test.ts) ------------------- */

/** Estrae le osservazioni { "AAAA-MM": numero } da una risposta SDMX-ML (structure specific). */
export function parseObservations(xml) {
  const out = {};
  for (const m of xml.matchAll(/<Obs\b([^>]*?)\/?>/g)) {
    const period = /TIME_PERIOD="([^"]+)"/.exec(m[1])?.[1];
    const value = /OBS_VALUE="([^"]+)"/.exec(m[1])?.[1];
    if (!period || value === undefined || !/^\d{4}-\d{2}$/.test(period)) continue;
    const num = Number(value);
    if (Number.isFinite(num)) out[period] = num;
  }
  return out;
}

/** Estrae più serie da una risposta SDMX-ML: { valore dimensione: { periodo: numero } }. */
export function parseSeriesBy(xml, dimension) {
  const out = {};
  for (const m of xml.matchAll(/<Series\b([^>]*)>([\s\S]*?)<\/Series>/g)) {
    const key = new RegExp(`\\b${dimension}="([^"]+)"`).exec(m[1])?.[1];
    if (!key) continue;
    out[key] = {};
    for (const o of m[2].matchAll(/<Obs\b([^>]*?)\/?>/g)) {
      const period = /TIME_PERIOD="([^"]+)"/.exec(o[1])?.[1];
      const value = Number(/OBS_VALUE="([^"]+)"/.exec(o[1])?.[1]);
      if (period && Number.isFinite(value)) out[key][period] = value;
    }
  }
  return out;
}

/** Variazione annua di un trimestre ("2026-Q2" su "2025-Q2"), arrotondata a un decimale. */
export function yoyQuarter(series, q) {
  const [y, n] = q.split('-Q');
  const prev = series[`${Number(y) - 1}-Q${n}`];
  const cur = series[q];
  if (!prev || !cur) return null;
  return Math.round((cur / prev - 1) * 1000) / 10;
}

/** Controlli sulle serie IPAB: tutte le aree, trimestri consecutivi, valori plausibili, dati recenti. */
export function validateIpab(byArea, today = new Date()) {
  for (const code of Object.keys(IPAB_AREE)) {
    const s = byArea[code];
    if (!s) throw new Error(`Serie IPAB mancante per ${code}`);
    const keys = Object.keys(s).sort();
    if (keys.length < 20) throw new Error(`Troppi pochi trimestri per ${code}`);
    for (const [k, v] of Object.entries(s)) {
      if (!/^\d{4}-Q[1-4]$/.test(k)) throw new Error(`Periodo non valido ${k}`);
      if (!(v > 30 && v < 300)) throw new Error(`Valore IPAB non plausibile ${code} ${k}: ${v}`);
    }
    for (let i = 1; i < keys.length; i++) {
      const [y1, q1] = keys[i - 1].split('-Q').map(Number);
      const [y2, q2] = keys[i].split('-Q').map(Number);
      if ((y2 - y1) * 4 + (q2 - q1) !== 1) throw new Error(`Trimestri non consecutivi per ${code}: ${keys[i - 1]} → ${keys[i]}`);
    }
    const [ly, lq] = keys.at(-1).split('-Q').map(Number);
    const ageMonths = (today.getFullYear() - ly) * 12 + (today.getMonth() + 1 - lq * 3);
    if (ageMonths > 9) throw new Error(`Ultimo trimestre IPAB troppo vecchio per ${code}: ${keys.at(-1)}`);
  }
}

/** Variazione congiunturale (sul mese prima) arrotondata a un decimale. */
export function mom(series, month) {
  const [y, m] = month.split('-').map(Number);
  const prev = series[m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`];
  const cur = series[month];
  if (!prev || !cur) return null;
  return Math.round((cur / prev - 1) * 1000) / 10;
}

/** Controlli sulle serie NIC per voce: tutte le voci, mesi consecutivi dal 2026-01, valori plausibili, dati recenti. */
export function validatePrezzi(byCode, today = new Date()) {
  for (const code of Object.keys(NIC_VOCI)) {
    const s = byCode[code];
    if (!s) throw new Error(`Serie NIC mancante per ${code}`);
    const keys = Object.keys(s).sort();
    if (keys[0] !== NEW_START) throw new Error(`La serie ${code} non parte da ${NEW_START}`);
    for (const [k, v] of Object.entries(s)) {
      if (!/^\d{4}-\d{2}$/.test(k)) throw new Error(`Periodo non valido ${k}`);
      if (!(v > 50 && v < 250)) throw new Error(`Valore non plausibile ${code} ${k}: ${v}`);
    }
    for (let i = 1; i < keys.length; i++) {
      const [y1, m1] = keys[i - 1].split('-').map(Number);
      const [y2, m2] = keys[i].split('-').map(Number);
      if ((y2 - y1) * 12 + (m2 - m1) !== 1) throw new Error(`Mesi non consecutivi per ${code}: ${keys[i - 1]} → ${keys[i]}`);
    }
    const [ly, lm] = keys.at(-1).split('-').map(Number);
    if ((today.getFullYear() - ly) * 12 + (today.getMonth() + 1 - lm) > 4) {
      throw new Error(`Ultimo mese troppo vecchio per ${code}: ${keys.at(-1)}`);
    }
  }
}

/** Coefficiente di raccordo: media annua 2025 degli indici in base 2015, arrotondata a un decimale, ÷ 100. */
export function linkingCoefficient(oldSeries, year = 2025) {
  const values = Array.from({ length: 12 }, (_, i) => oldSeries[`${year}-${String(i + 1).padStart(2, '0')}`]);
  if (values.some((v) => typeof v !== 'number')) throw new Error(`Mancano mesi del ${year} nella serie in base 2015`);
  const mean = Math.round((values.reduce((a, b) => a + b, 0) / 12) * 10) / 10;
  return mean / 100;
}

/** Unisce le serie: i valori in base 2015 vengono divisi per il coefficiente (4 decimali). */
export function mergeSeries(oldSeries, newSeries, coefficient) {
  const merged = {};
  for (const [k, v] of Object.entries(oldSeries)) {
    if (k < NEW_START) merged[k] = Math.round((v / coefficient) * 10000) / 10000;
  }
  for (const [k, v] of Object.entries(newSeries)) merged[k] = v;
  return Object.fromEntries(Object.entries(merged).sort(([a], [b]) => a.localeCompare(b)));
}

/** Variazione annua arrotondata a un decimale, come nel calcolatore. */
export function yoy(series, month) {
  const [y, m] = month.split('-');
  const prev = series[`${Number(y) - 1}-${m}`];
  const cur = series[month];
  if (!prev || !cur) return null;
  return Math.round((cur / prev - 1) * 1000) / 10;
}

/** Controlli di plausibilità: continuità dei mesi, valori realistici, dati recenti. */
export function validate(series, today = new Date()) {
  const keys = Object.keys(series);
  if (keys.length < 24) throw new Error(`Troppi pochi mesi (${keys.length})`);
  for (const [k, v] of Object.entries(series)) {
    if (!(v > 50 && v < 200)) throw new Error(`Valore non plausibile per ${k}: ${v}`);
  }
  for (let i = 1; i < keys.length; i++) {
    const [y1, m1] = keys[i - 1].split('-').map(Number);
    const [y2, m2] = keys[i].split('-').map(Number);
    if ((y2 - y1) * 12 + (m2 - m1) !== 1) throw new Error(`Mesi non consecutivi: ${keys[i - 1]} → ${keys[i]}`);
  }
  const [ly, lm] = keys.at(-1).split('-').map(Number);
  const age = (today.getFullYear() - ly) * 12 + (today.getMonth() + 1 - lm);
  if (age > 4) throw new Error(`Ultimo mese troppo vecchio: ${keys.at(-1)}`);
}

/* --- Esecuzione ------------------------------------------------------------- */

async function fetchSeries(flow, key, start) {
  const url = `${API}/data/${flow}/${key}?startPeriod=${start}`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { Accept: ACCEPT }, signal: AbortSignal.timeout(90_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const series = parseObservations(await res.text());
      console.log(`${key}: ${Object.keys(series).length} mesi (${url})`);
      return series;
    } catch (e) {
      console.warn(`Tentativo ${attempt} fallito per ${key}: ${e.message}`);
      if (attempt === 3) throw e;
      await new Promise((r) => setTimeout(r, 5000 * attempt));
    }
  }
}

async function fetchXml(flow, key, start) {
  const url = `${API}/data/${flow}/${key}?startPeriod=${start}`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { Accept: ACCEPT }, signal: AbortSignal.timeout(180_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      console.warn(`Tentativo ${attempt} fallito per ${url}: ${e.message}`);
      if (attempt === 3) throw e;
      await new Promise((r) => setTimeout(r, 10000 * attempt));
    }
  }
}

async function updateIpab(dryRun) {
  const areas = Object.keys(IPAB_AREE).join('+');
  const index = parseSeriesBy(await fetchXml(FLOW_IPAB, `Q.${areas}.105.4.EXST_DW`, IPAB_START), 'REF_AREA');
  validateIpab(index);
  const official = parseSeriesBy(await fetchXml(FLOW_IPAB, `Q.${areas}.105.7.EXST_DW`, '2024-Q1').catch(() => ''), 'REF_AREA');

  // Confronto con le variazioni annue ufficiali ISTAT
  let checked = 0;
  for (const [code, series] of Object.entries(official)) {
    for (const [q, value] of Object.entries(series)) {
      const computed = yoyQuarter(index[code] ?? {}, q);
      if (computed === null) continue;
      checked++;
      const diff = Math.abs(computed - value);
      if (diff > 0.05) console.log(`IPAB ${code} ${q}: calcolata ${computed}% – ufficiale ${value}%  ← DIFFERENZA`);
      if (diff > 0.25) throw new Error(`Variazione IPAB per ${code} ${q} non coerente con quella ISTAT`);
    }
  }
  console.log(`IPAB: ${checked} variazioni annue confrontate con quelle ufficiali`);
  if (!checked) console.warn('Attenzione: nessuna variazione IPAB ufficiale disponibile per il confronto.');

  const series = {};
  for (const [code, key] of Object.entries(IPAB_AREE)) {
    series[key] = Object.fromEntries(Object.entries(index[code]).sort(([a], [b]) => a.localeCompare(b)));
  }
  let current = {};
  try {
    current = JSON.parse(readFileSync(IPAB_FILE, 'utf8'));
  } catch {
    /* primo aggiornamento */
  }
  const strip = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => !k.startsWith('_')));
  const changed = JSON.stringify(strip(current)) !== JSON.stringify(series);
  const last = Object.keys(series.NO).at(-1);
  console.log(`IPAB ultimo trimestre: ${last} – ${changed ? 'dati cambiati' : 'nessuna novità'}`);
  if (!changed || dryRun) return;
  const output = {
    _istruzioni:
      'File aggiornato in automatico da scripts/update-istat.mjs (GitHub Actions). Indice ISTAT dei prezzi delle abitazioni esistenti (IPAB), base 2025=100, trimestrale. Chiavi: NO, NE, CE, SI (aree), ROMA, MILANO, TORINO.',
    _fonte: 'ISTAT - Prezzi delle abitazioni (IPAB) - https://esploradati.istat.it/',
    _aggiornato: new Date().toISOString().slice(0, 10),
    ...series,
  };
  writeFileSync(IPAB_FILE, `${JSON.stringify(output, null, 1)}\n`);
  console.log(`Scritto ${IPAB_FILE}`);
}

async function updatePrezzi(dryRun) {
  const codes = Object.keys(NIC_VOCI).join('+');
  const index = parseSeriesBy(await fetchXml(FLOW_NIC, `M.IT.85.4.${codes}`, NEW_START), 'ECOICOP_2');
  validatePrezzi(index);
  const official = parseSeriesBy(await fetchXml(FLOW_NIC, `M.IT.85.6.${codes}`, NEW_START).catch(() => ''), 'ECOICOP_2');

  // Confronto con le variazioni congiunturali ufficiali ISTAT (indici arrotondati: tolleranza 0,15 punti)
  let checked = 0;
  for (const [code, series] of Object.entries(official)) {
    for (const [month, value] of Object.entries(series)) {
      const computed = mom(index[code] ?? {}, month);
      if (computed === null) continue;
      checked++;
      if (Math.abs(computed - value) > 0.15) throw new Error(`Variazione NIC ${code} ${month} non coerente: ${computed}% contro ${value}%`);
    }
  }
  console.log(`NIC: ${checked} variazioni mensili confrontate con quelle ufficiali`);
  if (!checked) console.warn('Attenzione: nessuna variazione NIC ufficiale disponibile per il confronto.');

  const series = {};
  for (const [code, key] of Object.entries(NIC_VOCI)) {
    series[key] = Object.fromEntries(Object.entries(index[code]).sort(([a], [b]) => a.localeCompare(b)));
  }
  let current = {};
  try {
    current = JSON.parse(readFileSync(PREZZI_FILE, 'utf8'));
  } catch {
    /* primo aggiornamento */
  }
  const strip = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => !k.startsWith('_')));
  const changed = JSON.stringify(strip(current)) !== JSON.stringify(series);
  for (const [key, s] of Object.entries(series)) {
    const last = Object.keys(s).at(-1);
    console.log(`NIC ${key}: ultimo mese ${last} = ${s[last]}`);
  }
  console.log(`NIC: ${changed ? 'dati cambiati' : 'nessuna novità'}`);
  if (!changed || dryRun) return;
  const output = {
    _istruzioni:
      'File aggiornato in automatico da scripts/update-istat.mjs (GitHub Actions). Indici dei prezzi al consumo NIC per voce di spesa (ECOICOP v2), base 2025=100, mensili. Chiavi: elettricita (04510), materiali (04311), manodopera (04320).',
    _fonte: 'ISTAT - Prezzi al consumo per l’intera collettività (NIC) - https://esploradati.istat.it/',
    _aggiornato: new Date().toISOString().slice(0, 10),
    ...series,
  };
  writeFileSync(PREZZI_FILE, `${JSON.stringify(output, null, 1)}\n`);
  console.log(`Scritto ${PREZZI_FILE}`);
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const errors = [];
  for (const [name, job] of [['FOI', updateFoi], ['IPAB', updateIpab], ['NIC', updatePrezzi]]) {
    try {
      await job(dryRun);
    } catch (e) {
      console.error(`Aggiornamento ${name} non riuscito: ${e.message}`);
      errors.push(name);
    }
  }
  // Un errore su un indice non blocca l'altro, ma il workflow risulta fallito e GitHub avvisa.
  if (errors.length) process.exit(1);
}

async function updateFoi(dryRun) {
  const oldSeries = await fetchSeries(FLOW_OLD, KEY_OLD, OLD_START);
  const newSeries = await fetchSeries(FLOW_NEW, KEY_NEW, NEW_START);
  const official = await fetchSeries(FLOW_NEW, KEY_NEW_YOY, NEW_START).catch(() => ({}));

  const coefficient = linkingCoefficient(oldSeries);
  const series = mergeSeries(oldSeries, newSeries, coefficient);
  validate(series);
  console.log(`Coefficiente di raccordo base 2015 → 2025: ${coefficient}`);

  // Confronto con le variazioni tendenziali ufficiali ISTAT
  let checked = 0;
  for (const [month, value] of Object.entries(official)) {
    const computed = yoy(series, month);
    if (computed === null) continue;
    checked++;
    const diff = Math.abs(computed - value);
    console.log(`${month}: calcolata ${computed}% – ufficiale ${value}%${diff > 0.05 ? '  ← DIFFERENZA' : ''}`);
    if (diff > 0.15) throw new Error(`La variazione calcolata per ${month} non coincide con quella ISTAT`);
  }
  if (!checked) console.warn('Attenzione: nessuna variazione ufficiale disponibile per il confronto.');

  const current = JSON.parse(readFileSync(FILE, 'utf8'));
  const oldMonths = Object.fromEntries(Object.entries(current).filter(([k]) => /^\d{4}-\d{2}$/.test(k)));
  const changed = JSON.stringify(oldMonths) !== JSON.stringify(series);
  console.log(`Ultimo mese: ${Object.keys(series).at(-1)} – ${changed ? 'dati cambiati' : 'nessuna novità'}`);
  if (!changed || dryRun) return;

  const today = new Date().toISOString().slice(0, 10);
  const output = {
    _istruzioni:
      "File aggiornato in automatico da scripts/update-istat.mjs (GitHub Actions). Indici FOI senza tabacchi in base 2025=100; i mesi fino a dicembre 2025 sono riportati in base 2025 con il coefficiente di raccordo ISTAT. Formato: \"AAAA-MM\": valore.",
    _fonte: 'ISTAT - Indici dei prezzi al consumo per le famiglie di operai e impiegati (FOI) senza tabacchi - https://esploradati.istat.it/',
    _base: '2025=100',
    _raccordo: `Valori fino a 2025-12 divisi per ${coefficient} (media 2025 in base 2015 / 100)`,
    _aggiornato: today,
    ...series,
  };
  writeFileSync(FILE, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`Scritto ${FILE}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
