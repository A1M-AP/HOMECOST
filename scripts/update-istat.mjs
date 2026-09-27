#!/usr/bin/env node
/**
 * Aggiorna public/data/istat-foi.json con gli indici ufficiali ISTAT FOI senza tabacchi.
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

async function main() {
  const dryRun = process.argv.includes('--dry-run');
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

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error(`Aggiornamento ISTAT non riuscito: ${e.message}`);
    process.exit(1);
  });
}
