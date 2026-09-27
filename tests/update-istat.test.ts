import { test } from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error script JavaScript senza dichiarazioni di tipo
import { parseObservations, linkingCoefficient, mergeSeries, yoy, validate } from '../scripts/update-istat.mjs';

const SAMPLE = `<message:DataSet><Series FREQ="M" REF_AREA="IT" DATA_TYPE="101" MEASURE="4" ECOICOP_2="00ST">
<Obs TIME_PERIOD="2026-01" OBS_VALUE="100.4" /><Obs TIME_PERIOD="2026-02" OBS_VALUE="101" />
<Obs OBS_VALUE="101.5" TIME_PERIOD="2026-03"/></Series></message:DataSet>`;

test('lettura delle osservazioni SDMX', () => {
  assert.deepEqual(parseObservations(SAMPLE), { '2026-01': 100.4, '2026-02': 101, '2026-03': 101.5 });
  assert.deepEqual(parseObservations('<Error/>'), {});
});

test('raccordo tra base 2015 e base 2025', () => {
  const old: Record<string, number> = {};
  for (let m = 1; m <= 12; m++) old[`2025-${String(m).padStart(2, '0')}`] = 120 + m * 0.2; // media 121,3
  const coef = linkingCoefficient(old);
  assert.equal(coef, 1.213);
  const merged = mergeSeries(old, { '2026-01': 100.4 }, coef);
  assert.equal(merged['2025-01'], Math.round((120.2 / 1.213) * 10000) / 10000);
  assert.equal(merged['2026-01'], 100.4);
  assert.deepEqual(Object.keys(merged).slice(-2), ['2025-12', '2026-01']);
  // variazione gennaio 2026 su gennaio 2025 = 100,4 × 1,213 / 120,2 − 1
  assert.equal(yoy({ ...merged, '2026-01': 100.4 }, '2026-01'), Math.round((100.4 * 1.213 / 120.2 - 1) * 1000) / 10);
  assert.throws(() => linkingCoefficient({ '2025-01': 120 }));
});

test('controlli di plausibilità', () => {
  const series: Record<string, number> = {};
  for (let i = 0; i < 30; i++) {
    const y = 2024 + Math.floor(i / 12);
    series[`${y}-${String((i % 12) + 1).padStart(2, '0')}`] = 100 + i * 0.1;
  }
  assert.doesNotThrow(() => validate(series, new Date('2026-08-15')));
  assert.throws(() => validate(series, new Date('2027-06-15')), /troppo vecchio/);
  assert.throws(() => validate({ ...series, '2024-05': 5 }, new Date('2026-08-15')), /plausibile/);
  const gap = { ...series };
  delete gap['2025-03'];
  assert.throws(() => validate(gap, new Date('2026-08-15')), /consecutivi/);
});
