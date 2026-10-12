import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ceilSafe, round } from '../src/lib/calc/utils.ts';
import { calcEnergia } from '../src/lib/calc/energia.ts';
import { calcPittura, bestCombo } from '../src/lib/calc/pittura.ts';
import { calcPiastrelle } from '../src/lib/calc/piastrelle.ts';
import { calcCartongesso } from '../src/lib/calc/cartongesso.ts';
import { calcParquet, estimatePerimeter } from '../src/lib/calc/parquet.ts';
import {
  parseIstatData, variazioneDaIndici, calcCanone, checkDates, shiftMonth, istatWarnings, formatMonthKey,
} from '../src/lib/calc/istat.ts';
import { parseNumber } from '../src/lib/format.ts';

const close = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

test('ceilSafe ignora i residui della virgola mobile', () => {
  assert.equal(ceilSafe(7.5 / 2.5), 3);
  assert.equal(ceilSafe(0.1 * 3 / 0.1), 3);
  assert.equal(ceilSafe(3.01), 4);
  assert.equal(round(1.005, 2), 1.01);
});

test('parseNumber accetta il formato italiano', () => {
  assert.equal(parseNumber('2,5'), 2.5);
  assert.equal(parseNumber('2.5'), 2.5);
  assert.equal(parseNumber('1.500'), 1500);
  assert.equal(parseNumber('1.234,56'), 1234.56);
  assert.equal(parseNumber('0.250'), 0.25);
  assert.equal(parseNumber(' 750 '), 750);
  assert.equal(parseNumber('€ 650'), 650);
  assert.ok(Number.isNaN(parseNumber('abc')));
  assert.ok(Number.isNaN(parseNumber('1,2,3')));
  assert.equal(parseNumber(''), null);
});

test('energia: kWh e costi mensili/annuali', () => {
  const r = calcEnergia({ watt: 2000, oreGiorno: 1, giorniMese: 10, prezzoKwh: 0.3 });
  close(r.kwhMese, 20);
  close(r.costoMese, 6);
  close(r.costoAnno, 72);
  close(r.kwhStandby, 0);
});

test('energia: lo standby conta sulle ore residue del mese', () => {
  const r = calcEnergia({ watt: 100, oreGiorno: 4, giorniMese: 30, prezzoKwh: 0.25, standbyWatt: 1 });
  close(r.kwhUso, 12);
  close(r.oreStandby, 720 - 120);
  close(r.kwhStandby, 0.6);
  close(r.kwhMese, 12.6);
  close(r.costoMese, 3.15);
});

test('pittura: superficie, litri e barattoli', () => {
  const out = calcPittura({
    lunghezza: 4, larghezza: 3, altezza: 2.7,
    porteN: 1, porteLarghezza: 0.8, porteAltezza: 2.1,
    finestreN: 1, finestreLarghezza: 1.2, finestreAltezza: 1.4,
    soffitto: true, mani: 2, resa: 10, scarto: 10,
  });
  assert.ok(out.ok);
  const r = out.result;
  close(r.pareti, 2 * 7 * 2.7 - 1.68 - 1.68);
  close(r.soffitto, 12);
  close(r.superficie, 34.44 + 12);
  close(r.litri, (46.44 * 2) / 10 * 1.1);
  assert.deepEqual(r.perFormato.map((f) => f.pezzi), [5, 3, 2]);
  // 10,22 L → 10 + 2,5 = 12,5 L (meno spreco di 5+5+2,5 a parità di litri? stesso volume, meno barattoli)
  assert.equal(r.migliore.litri, 12.5);
  assert.equal(r.migliore.pezzi, 2);
});

test('pittura: aperture più grandi delle pareti generano errore', () => {
  const out = calcPittura({
    lunghezza: 1, larghezza: 1, altezza: 2,
    porteN: 10, porteLarghezza: 1, porteAltezza: 2,
    finestreN: 0, finestreLarghezza: 1, finestreAltezza: 1,
    soffitto: false, mani: 2, resa: 10, scarto: 10,
  });
  assert.equal(out.ok, false);
});

test('pittura: combinazione più conveniente', () => {
  assert.deepEqual(bestCombo(6.2).cans, { 2.5: 1, 5: 1, 10: 0 });
  assert.deepEqual(bestCombo(4.6).cans, { 2.5: 0, 5: 1, 10: 0 });
  assert.deepEqual(bestCombo(9).cans, { 2.5: 0, 5: 0, 10: 1 });
  // Con i prezzi vince la combinazione più economica.
  const conPrezzi = bestCombo(6.2, { 2.5: 30, 5: 45, 10: 60 });
  assert.deepEqual(conPrezzi.cans, { 2.5: 0, 5: 0, 10: 1 });
  assert.equal(conPrezzi.costo, 60);
});

test('piastrelle: numero di pezzi e scatole', () => {
  const out = calcPiastrelle({ superficie: 20, latoA: 60, latoB: 60, m2Scatola: 1.44, scarto: 10 });
  assert.ok(out.ok);
  const r = out.result;
  close(r.m2ConScarto, 22);
  assert.equal(r.piastrelle, 62); // 22 / 0,36 = 61,1
  assert.equal(r.scatole, 16); // 22 / 1,44 = 15,28
  assert.equal(r.piastrellePerScatola, 4);
  close(r.m2Acquistati, 23.04);
});

test('piastrelle: scatola più piccola di una piastrella', () => {
  const out = calcPiastrelle({ superficie: 20, latoA: 120, latoB: 280, m2Scatola: 1, scarto: 10 });
  assert.equal(out.ok, false);
});

test('cartongesso: lastre, profili e viti', () => {
  const out = calcCartongesso({
    lunghezza: 4, altezza: 2.7, lati: 2, strati: 1, altezzaLastra: 3, interasse: 60, aperture: 0, scarto: 10,
  });
  assert.ok(out.ok);
  const r = out.result;
  close(r.areaParete, 10.8);
  // lastra 1,2 × 3 più alta della parete: copre 1,2 × 2,7 → 3,33 per lato → 6,67 × 1,1 = 7,33 → 8
  assert.equal(r.lastre, 8);
  close(r.guideMetri, 8.8);
  assert.equal(r.guideBarre, 3);
  assert.equal(r.montanti, 9); // 400/60 = 6,67 → 7 campate → 8 montanti → +10% = 8,8 → 9
  assert.equal(r.viti, 360); // 10,8 × 2 × 15 × 1,1 = 356,4 → 360
  assert.equal(r.tasselli, 18);
  assert.equal(r.lastraPiuAltaDellaParete, true);
});

test('cartongesso: doppia lastra con lastre basse', () => {
  const out = calcCartongesso({
    lunghezza: 3, altezza: 2.7, lati: 1, strati: 2, altezzaLastra: 2, interasse: 60, aperture: 0, scarto: 0,
  });
  assert.ok(out.ok);
  // 8,1 m² / (1,2 × 2) = 3,375 × 2 strati = 6,75 → 7
  assert.equal(out.result.lastre, 7);
});

test('parquet: confezioni e battiscopa', () => {
  const out = calcParquet({ superficie: 20, m2Confezione: 2.2, scarto: 8, perimetro: 18, porte: 0.8 });
  assert.ok(out.ok);
  const r = out.result;
  close(r.m2ConScarto, 21.6);
  assert.equal(r.confezioni, 10);
  close(r.battiscopa, 17.2 * 1.1);
  assert.equal(r.barreBattiscopa, 8);
  close(estimatePerimeter(16), 16);
});

test('istat: lettura del file e segnaposto', () => {
  const data = parseIstatData({
    _nota: 'DA AGGIORNARE',
    _aggiornato: '2026-09-15',
    '2025-08': 'DA AGGIORNARE CON DATI UFFICIALI ISTAT',
    '2025-07': 120.1,
    '2026-07': 122.5,
    'errata': 3,
  });
  assert.deepEqual(data.indici, { '2025-07': 120.1, '2026-07': 122.5 });
  assert.equal(data.segnaposto, 1);
  assert.equal(data.ultimoMese, '2026-07');
  assert.equal(data.aggiornato, '2026-09-15');
});

test('istat: variazione dagli indici e nuovo canone', () => {
  const v = variazioneDaIndici({ '2025-07': 120.0, '2026-07': 121.9 }, 2026, 7);
  assert.ok(v.ok);
  assert.equal(v.variazione, 1.6); // 1,583% → 1,6
  const missing = variazioneDaIndici({}, 2026, 7);
  assert.equal(missing.ok, false);

  const r = calcCanone({ canone: 800, variazione: 1.6, percentuale: 75, cedolare: false });
  close(r.variazioneApplicata, 1.2);
  close(r.aumentoMensile, 9.6);
  close(r.aumentoAnnuo, 115.2);
  close(r.nuovoCanone, 809.6);
});

test('istat: date e avvisi', () => {
  assert.deepEqual(shiftMonth(2026, 1, -1), { year: 2025, month: 12 });
  assert.deepEqual(shiftMonth(2026, 3, -2), { year: 2026, month: 1 });
  assert.equal(formatMonthKey('2026-08'), 'agosto 2026');
  assert.equal(checkDates({ inizioAnno: 2025, inizioMese: 10, aggAnno: 2026, aggMese: 9 }).ok, false);
  const ok = checkDates({ inizioAnno: 2023, inizioMese: 9, aggAnno: 2026, aggMese: 9 });
  assert.ok(ok.ok && ok.result.annualita === 4);

  const w = istatWarnings({
    inizioAnno: 2023, inizioMese: 9, aggAnno: 2026, aggMese: 9,
    tipo: 'commerciale', percentuale: 100, cedolare: true, variazione: -0.2,
  });
  assert.equal(w.length, 4);
  assert.match(w[0], /cedolare secca/);
});

test('istat: lettera e RTF', async () => {
  const { buildLetter, toRtf } = await import('../src/lib/calc/istat.ts');
  const risultato = calcCanone({ canone: 800, variazione: 1.6, percentuale: 75, cedolare: false });
  const text = buildLetter({
    locatore: 'Mario Rossi', indirizzoLocatore: '', conduttore: '', immobile: 'Via Roma 1, Milano',
    estremi: '', luogo: 'Milano', data: '27 settembre 2026', tipo: 'libero',
    inizioMese: 9, inizioAnno: 2023, aggMese: 9, aggAnno: 2026, periodo: 'agosto 2025 – agosto 2026',
    canone: 800, risultato,
  });
  assert.match(text, /\[Nome e cognome del conduttore\]/);
  assert.match(text, /\+1,6%/);
  assert.match(text, /809,60/);
  assert.match(text, /settembre 2026/);
  const rtf = toRtf('Perché {sì}\nciao');
  assert.ok(rtf.startsWith('{\\rtf1'));
  assert.match(rtf, /Perch\\u233\?/);
  assert.match(rtf, /\\\{s\\u236\?\\\}\\par/);
});

test('istat: calcolo completo da indici, manuale e dati mancanti', async () => {
  const { computeIstat, presentIstat } = await import('../src/lib/calc/istat.ts');
  const base = {
    canone: 800, tipo: 'libero' as const, inizioMese: 9, inizioAnno: 2023, aggMese: 9, aggAnno: 2026,
    anticipo: 1, percentuale: 75 as const, cedolare: false, variazioneManuale: null,
  };
  // Mese di riferimento: agosto (mese precedente all'aggiornamento)
  const out = computeIstat(base, { '2025-08': 120.0, '2026-08': 121.9 });
  assert.ok(out.ok);
  assert.equal(out.result.da, '2025-08');
  assert.equal(out.result.canone.nuovoCanone, 809.6);
  assert.equal(out.result.annualita, 4);
  assert.equal(presentIstat(base, out.result).text.periodo, 'agosto 2025 – agosto 2026');

  const missing = computeIstat(base, {});
  assert.equal(missing.ok, false);
  assert.ok(!missing.ok && /agosto 2025 e agosto 2026/.test(missing.errors._indici));

  const manual = computeIstat({ ...base, variazioneManuale: 2, percentuale: 100, cedolare: true }, {});
  assert.ok(manual.ok);
  const p = presentIstat({ ...base, variazioneManuale: 2, percentuale: 100, cedolare: true }, manual.result);
  assert.equal(p.flags?.bloccato, true);
  assert.match(p.text.nuovoCanone, /800,00/);
});

test('spesa stimata nei calcolatori', () => {
  const pia = calcPiastrelle({ superficie: 20, latoA: 60, latoB: 60, m2Scatola: 1.44, scarto: 10, prezzoM2: 25 });
  assert.ok(pia.ok);
  close(pia.result.costo!, 16 * 1.44 * 25); // 576 €

  const par = calcParquet({ superficie: 20, m2Confezione: 2.2, scarto: 8, perimetro: 18, porte: 0.8, prezzoM2: 35, prezzoBattiscopa: 4 });
  assert.ok(par.ok);
  close(par.result.costoParquet!, 10 * 2.2 * 35);
  close(par.result.costoBattiscopa!, 8 * 2.4 * 4);
  close(par.result.costo!, 770 + 76.8);

  const car = calcCartongesso({
    lunghezza: 4, altezza: 2.7, lati: 2, strati: 1, altezzaLastra: 3, interasse: 60, aperture: 0, scarto: 10,
    prezzi: { lastra: 9, guida: 4, montante: 5, viti100: 4, tassello: 0.15 },
  });
  assert.ok(car.ok);
  // 8 lastre, 3 guide, 9 montanti, 360 viti → 4 confezioni, 18 tasselli
  close(car.result.costo!, 8 * 9 + 3 * 4 + 9 * 5 + 4 * 4 + 18 * 0.15);

  const senzaPrezzo = calcPiastrelle({ superficie: 20, latoA: 60, latoB: 60, m2Scatola: 1.44, scarto: 10 });
  assert.ok(senzaPrezzo.ok && senzaPrezzo.result.costo === null);
});

test('prezzi rivalutati con l’indice ISTAT', async () => {
  const { revaluation, revalue, describeRevaluation } = await import('../src/lib/prices.ts');
  const data = parseIstatData({ '2026-09': 100, '2027-03': 101.5 });
  const r = revaluation(data, '2026-09');
  close(r.factor, 1.015);
  assert.equal(r.toMonth, '2027-03');
  assert.deepEqual(revalue({ a: 10, b: { c: 2 } }, r.factor), { a: 10.15, b: { c: 2.03 } });
  assert.match(describeRevaluation(r), /\+1,5%/);

  const vuoto = revaluation(parseIstatData({}), '2026-09');
  assert.equal(vuoto.factor, 1);
  assert.match(describeRevaluation(vuoto), /appena sono disponibili/);
  // Indice del mese base non ancora pubblicato
  assert.equal(revaluation(parseIstatData({ '2026-08': 99 }), '2026-09').factor, 1);
});

test('manodopera e spesa totale con la posa', () => {
  const pit = calcPittura({
    lunghezza: 4, larghezza: 3, altezza: 2.7, porteN: 0, porteLarghezza: 0.8, porteAltezza: 2.1,
    finestreN: 0, finestreLarghezza: 1, finestreAltezza: 1, soffitto: false, mani: 2, resa: 10, scarto: 10,
    prezzi: { 2.5: 20, 5: 32, 10: 55 }, prezzoPosaM2: 6,
  });
  assert.ok(pit.ok);
  close(pit.result.costoPosa!, 37.8 * 6); // pareti 2 × 7 × 2,7 = 37,8 m²
  close(pit.result.costoTotale!, pit.result.migliore.costo! + 37.8 * 6);

  const pia = calcPiastrelle({ superficie: 20, latoA: 60, latoB: 60, m2Scatola: 1.44, scarto: 10, prezzoM2: 25, prezzoPosaM2: 30 });
  assert.ok(pia.ok);
  close(pia.result.costoPosa!, 600); // posa sulla superficie netta, non sulle scatole
  close(pia.result.costoTotale!, 576 + 600);

  // Solo manodopera, senza prezzo dei materiali
  const soloPosa = calcPiastrelle({ superficie: 10, latoA: 60, latoB: 60, m2Scatola: 1.44, scarto: 10, prezzoPosaM2: 30 });
  assert.ok(soloPosa.ok && soloPosa.result.costo === null);
  close(soloPosa.result.costoTotale!, 300);

  const car = calcCartongesso({
    lunghezza: 4, altezza: 2.5, lati: 2, strati: 1, altezzaLastra: 2.5, interasse: 60, aperture: 1, scarto: 10, prezzoPosaM2: 15,
  });
  assert.ok(car.ok);
  close(car.result.costoPosa!, (10 - 1) * 2 * 15); // m² di parete × lati
  assert.equal(car.result.costo, null);

  const par = calcParquet({
    superficie: 20, m2Confezione: 2.2, scarto: 8, perimetro: 18, porte: 0.8, prezzoPosaM2: 20, prezzoPosaBattiscopa: 4,
  });
  assert.ok(par.ok);
  close(par.result.costoPosa!, 20 * 20 + (18 - 0.8) * 4);

  const fai = calcParquet({ superficie: 20, m2Confezione: 2.2, scarto: 8, perimetro: 18, porte: 0.8, prezzoM2: 35 });
  assert.ok(fai.ok && fai.result.costoPosa === null);
  close(fai.result.costoTotale!, fai.result.costo!);
});

test('prezzi rivalutati con l’indice ISTAT della loro voce di spesa', async () => {
  const { parsePriceIndices, categoryRevaluation, describeCategories } = await import('../src/lib/prices.ts');
  const foi = parseIstatData({ '2026-09': 100, '2026-11': 100.5 });
  const nic = parsePriceIndices({
    _aggiornato: '2026-12-01',
    elettricita: { '2026-09': 115.7, '2026-10': 118, '2026-11': 121.485 },
    materiali: { '2026-08': 102 }, // manca il mese base: si usa il FOI
    manodopera: { '2026-09': 103.4, 'x': 1, '2026-10': 'n.d.' },
    altro: { '2026-09': 1 },
  });
  assert.deepEqual(Object.keys(nic.serie).sort(), ['elettricita', 'manodopera', 'materiali']);
  assert.deepEqual(nic.serie.manodopera, { '2026-09': 103.4 });

  const el = categoryRevaluation('elettricita', nic, foi, '2026-09');
  close(el.factor, 1.05);
  assert.equal(el.toMonth, '2026-11');
  assert.equal(el.source, 'voce');

  const mat = categoryRevaluation('materiali', nic, foi, '2026-09');
  close(mat.factor, 1.005);
  assert.equal(mat.source, 'generale');

  const man = categoryRevaluation('manodopera', nic, foi, '2026-09');
  assert.equal(man.factor, 1);
  assert.equal(man.toMonth, null);

  const note = describeCategories([['elettricita', el], ['materiali', mat], ['manodopera', man]]);
  assert.match(note, /settembre 2026/);
  assert.match(note, /novembre 2026/);
  assert.match(note, /energia elettrica \+5%/);
  assert.match(note, /indice generale FOI/);
  assert.doesNotMatch(note, /servizi di manutenzione/);

  assert.match(describeCategories([['manodopera', man]]), /si aggiornano da soli/);
});
