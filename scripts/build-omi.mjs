#!/usr/bin/env node
/**
 * Converte le quotazioni OMI dell'Agenzia delle Entrate (file CSV "VALORI" e "ZONE" di un semestre)
 * in file JSON leggeri, uno per provincia, usati dal calcolatore "Quanto vale la mia casa".
 *
 * Uso:
 *   node scripts/build-omi.mjs <QI_..._AAAAS_VALORI.csv> <QI_..._AAAAS_ZONE.csv>
 *
 * I CSV si scaricano gratuitamente dall'area riservata dell'Agenzia delle Entrate
 * (Servizi → Forniture dati OMI → Quotazioni immobiliari). Fonte da citare: "Agenzia Entrate - OMI".
 *
 * Output: public/data/omi/meta.json e public/data/omi/<SIGLA>.json
 */
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../public/data/omi/', import.meta.url));

/** Tipologie OMI usate dal calcolatore (codice OMI → chiave breve). */
export const TIPOLOGIE = { 20: 'civ', 21: 'eco', 19: 'sig', 1: 'vil', 13: 'box' };

/** Area ISTAT per l'aggiornamento con l'indice dei prezzi delle abitazioni. */
export const AREE = { 'NORD-OVEST': 'NO', 'NORD-EST': 'NE', CENTRO: 'CE', SUD: 'SI', ISOLE: 'SI' };

/** Comuni con un indice ISTAT dedicato. */
export const CITTA = { 'ROMA|RM': 'ROMA', 'MILANO|MI': 'MILANO', 'TORINO|TO': 'TORINO' };

/** Separatore del file: i CSV ufficiali usano ";", quelli rielaborati spesso ",". */
export function detectSeparator(text) {
  const header = text.split(/\r?\n/).find((l) => /Cod_Tip|Zona_Descr|Comune_ISTAT/.test(l)) ?? '';
  return (header.match(/;/g)?.length ?? 0) > (header.match(/,/g)?.length ?? 0) ? ';' : ',';
}

/** Parser CSV minimale (campi tra virgolette, separatore indicato). */
export function parseCsv(text, sep = detectSeparator(text)) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Righe CSV → oggetti, saltando l'eventuale riga di titolo prima dell'intestazione. */
export function toObjects(rows, mustHave) {
  const start = rows.findIndex((r) => r.includes(mustHave));
  if (start < 0) throw new Error(`Intestazione con "${mustHave}" non trovata`);
  const head = rows[start].map((h) => h.trim());
  return rows.slice(start + 1).map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])));
}

const num = (s) => Number(String(s).replace(/\./g, '').replace(',', '.'));

/** "'CENTRO URBANO'" → "Centro urbano" */
export function prettyZone(s) {
  const t = s.replace(/^'+|'+$/g, '').replace(/`/g, "'").trim().toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** "ALESSANDRIA" → "Alessandria", "REGGIO NELL'EMILIA" → "Reggio nell'Emilia" */
export function prettyName(s) {
  const small = new Set(['di', 'del', 'della', 'dei', 'delle', 'nel', 'nella', 'sul', 'sulla', 'in', 'e', 'al', 'all', 'nell', 'dell', 'sull', 'sotto', 'sopra']);
  return s
    .replace(/`/g, "'")
    .toLowerCase()
    .split(/(\s+|-|')/)
    .map((w, i) => (i > 0 && small.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join('');
}

/** Semestre dal nome del file: QI_..._20182_VALORI.csv → "2018-2" */
export function semesterFromName(name) {
  const m = /_(\d{4})([12])_VALORI/i.exec(name);
  return m ? `${m[1]}-${m[2]}` : null;
}

/** Costruisce i dati per provincia a partire dalle righe VALORI e ZONE. */
export function buildProvinces(valori, zone) {
  const zoneDescr = new Map(zone.map((z) => [z.LinkZona, prettyZone(z.Zona_Descr ?? '')]));
  const provinces = new Map();
  for (const r of valori) {
    const key = TIPOLOGIE[Number(r.Cod_Tip)];
    if (!key || r.Stato !== 'NORMALE') continue;
    const min = num(r.Compr_min);
    const max = num(r.Compr_max);
    if (!(min > 0 && max >= min)) continue;
    const sigla = r.Prov;
    if (!provinces.has(sigla)) provinces.set(sigla, { sigla, regione: prettyName(r.Regione), comuni: new Map() });
    const prov = provinces.get(sigla);
    const comuneKey = r.Comune_ISTAT;
    if (!prov.comuni.has(comuneKey)) {
      const nome = r.Comune_descrizione;
      prov.comuni.set(comuneKey, {
        n: prettyName(nome),
        a: CITTA[`${nome}|${sigla}`] ?? AREE[r.Area_territoriale] ?? 'SI',
        z: new Map(),
      });
    }
    const comune = prov.comuni.get(comuneKey);
    if (!comune.z.has(r.LinkZona)) {
      comune.z.set(r.LinkZona, { c: r.Zona, f: r.Fascia, d: zoneDescr.get(r.LinkZona) || r.Zona, t: {} });
    }
    comune.z.get(r.LinkZona).t[key] = [min, max];
  }
  const fasciaOrder = { B: 0, C: 1, D: 2, E: 3, R: 4 };
  const out = [];
  for (const prov of provinces.values()) {
    const comuni = [...prov.comuni.values()]
      .map((c) => ({
        ...c,
        z: [...c.z.values()]
          .filter((z) => Object.keys(z.t).some((k) => k !== 'box'))
          .sort((a, b) => (fasciaOrder[a.f] ?? 9) - (fasciaOrder[b.f] ?? 9) || a.c.localeCompare(b.c, 'it', { numeric: true })),
      }))
      .filter((c) => c.z.length)
      .sort((a, b) => a.n.localeCompare(b.n, 'it'));
    out.push({ sigla: prov.sigla, regione: prov.regione, comuni });
  }
  return out.sort((a, b) => a.sigla.localeCompare(b.sigla));
}

function main() {
  const [valoriPath, zonePath] = process.argv.slice(2);
  if (!valoriPath || !zonePath) {
    console.error('Uso: node scripts/build-omi.mjs <VALORI.csv> <ZONE.csv>');
    process.exit(1);
  }
  const semestre = semesterFromName(basename(valoriPath));
  if (!semestre) throw new Error('Impossibile ricavare il semestre dal nome del file VALORI');
  const valori = toObjects(parseCsv(readFileSync(valoriPath, 'utf8')), 'Cod_Tip');
  const zone = toObjects(parseCsv(readFileSync(zonePath, 'utf8')), 'Zona_Descr');
  const provinces = buildProvinces(valori, zone);

  mkdirSync(OUT, { recursive: true });
  for (const f of readdirSync(OUT)) if (f.endsWith('.json')) rmSync(join(OUT, f));
  for (const p of provinces) {
    writeFileSync(join(OUT, `${p.sigla}.json`), JSON.stringify({ p: p.sigla, s: semestre, c: p.comuni }));
  }
  const meta = {
    fonte: 'Agenzia Entrate - OMI',
    semestre,
    generato: new Date().toISOString().slice(0, 10),
    province: provinces.map((p) => ({ s: p.sigla, r: p.regione, n: p.comuni.length })),
  };
  writeFileSync(join(OUT, 'meta.json'), `${JSON.stringify(meta, null, 1)}\n`);
  const comuni = provinces.reduce((a, p) => a + p.comuni.length, 0);
  console.log(`OMI ${semestre}: ${provinces.length} province, ${comuni} comuni → ${OUT}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
