import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcValore, superficieCommerciale, presentValore, toThousand, type ValoreInput } from '../src/lib/calc/valore.ts';
import { ipabFactors, parseIpab, semesterQuarters, formatQuarter } from '../src/lib/ipab.ts';
import { parseCsv, toObjects, buildProvinces, semesterFromName, prettyName, detectSeparator } from '../scripts/build-omi.mjs';

const close = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

test('superficie commerciale (DPR 138/1998)', () => {
  close(superficieCommerciale({ superficie: 80, balconi: 8, cantina: 0, giardino: 0 }), 82.4);
  // balconi oltre 25 m² al 10%, cantina 25%, giardino 10% fino a 80 m² e 2% oltre
  close(superficieCommerciale({ superficie: 80, balconi: 35, cantina: 12, giardino: 180 }), 80 + 7.5 + 1 + 3 + 8 + 2);
});

const base: ValoreInput = {
  superficie: 80, balconi: 8, cantina: 0, giardino: 0, box: 0,
  quotazione: [3000, 3600], quotazioneBox: [1500, 2100], tipologia: 'civ',
  stato: 'abitabile', piano: 'intermedio', classe: 'EF', rivalutazione: 1.1,
};

test('stima del valore con coefficienti e aggiornamento ISTAT', () => {
  const out = calcValore(base);
  assert.ok(out.ok);
  close(out.result.coefficiente, 0.97);
  close(out.result.eurM2, 3300 * 0.97 * 1.1);
  close(out.result.valore, 3300 * 0.97 * 1.1 * 82.4);
  assert.equal(toThousand(out.result.valore), 290000);
  assert.equal(out.result.valoreBox, null);
  const p = presentValore(base, out.result);
  assert.match(p.text.valore.replace(/ /g, ' '), /^290\.000 €$/);
});

test('villa ignora il piano, box valutato a parte, zona senza quotazione', () => {
  const villa = calcValore({ ...base, tipologia: 'vil', piano: 'altoSenza', box: 15 });
  assert.ok(villa.ok);
  close(villa.result.coefficiente, 0.97);
  close(villa.result.valoreBox!, 1800 * 1.1 * 15);
  assert.equal(calcValore({ ...base, quotazione: [0, 0] }).ok, false);
});

test('coefficienti IPAB per area dal semestre OMI', () => {
  assert.deepEqual(semesterQuarters('2018-2'), ['2018-Q3', '2018-Q4']);
  assert.equal(formatQuarter('2026-Q2'), '2° trimestre 2026');
  const data = parseIpab({
    _aggiornato: '2026-09-20',
    NO: { '2018-Q3': 100, '2018-Q4': 102, '2026-Q1': 120, '2026-Q2': 121.2 },
    CE: { '2018-Q3': 100, '2018-Q4': 100, '2026-Q2': 110 },
    MILANO: { '2018-Q3': 100, '2018-Q4': 100, '2026-Q2': 150 },
    XX: { '2018-Q3': 1 },
  });
  const f = ipabFactors(data, '2018-2');
  assert.equal(f.to, '2026-Q2');
  close(f.factors.NO, 121.2 / 101);
  close(f.factors.CE, 1.1);
  close(f.factors.MILANO, 1.5);
  close(f.factors.ROMA, 1.1); // senza serie propria usa il Centro
  assert.equal(f.factors.SI, 1);
  assert.equal(ipabFactors(parseIpab({}), '2018-2').to, null);
});

test('lettura dei CSV OMI', () => {
  assert.equal(semesterFromName('QI_294577_1_20182_VALORI_utf8.csv'), '2018-2');
  assert.equal(prettyName("REGGIO NELL'EMILIA"), "Reggio nell'Emilia");
  const valoriCsv = `Quotazioni OMI 2018/2
Area_territoriale;Regione;Prov;Comune_ISTAT;Comune_descrizione;Fascia;Zona;LinkZona;Cod_Tip;Descr_Tipologia;Stato;Compr_min;Compr_max
NORD-OVEST;LOMBARDIA;MI;3015146;MILANO;B;B12;MI00000012;20;Abitazioni civili;NORMALE;7400;8900
NORD-OVEST;LOMBARDIA;MI;3015146;MILANO;B;B12;MI00000012;13;Box;NORMALE;4700;6600
NORD-OVEST;LOMBARDIA;MI;3015146;MILANO;B;B12;MI00000012;20;Abitazioni civili;OTTIMO;9000;9500
NORD-OVEST;LOMBARDIA;MI;3015146;MILANO;B;B12;MI00000012;5;Negozi;NORMALE;1;2
NORD-OVEST;LOMBARDIA;MI;3015001;ABBIATEGRASSO;D;D1;MI00000099;21;Abitazioni di tipo economico;NORMALE;"1.100";"1.400"
`;
  assert.equal(detectSeparator(valoriCsv), ';');
  const zoneCsv = `Area_territoriale,Comune_descrizione,Zona_Descr,Zona,LinkZona
NORD-OVEST,MILANO,'CENTRO STORICO - DUOMO',B12,MI00000012
`;
  const prov = buildProvinces(toObjects(parseCsv(valoriCsv), 'Cod_Tip'), toObjects(parseCsv(zoneCsv), 'Zona_Descr'));
  assert.equal(prov.length, 1);
  const [abb, mil] = prov[0].comuni;
  assert.equal(mil.n, 'Milano');
  assert.equal(mil.a, 'MILANO');
  assert.deepEqual(mil.z[0], { c: 'B12', f: 'B', d: 'Centro storico - duomo', t: { civ: [7400, 8900], box: [4700, 6600] } });
  assert.equal(abb.a, 'NO');
  assert.deepEqual(abb.z[0].t, { eco: [1100, 1400] });
});
