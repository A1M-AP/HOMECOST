import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseObservations, linkingCoefficient, mergeSeries, yoy, validate, mom, validatePrezzi, parseSeriesBy } from '../scripts/update-istat.mjs';

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

test('IPAB: lettura delle serie per area e controlli', async () => {
  const { parseSeriesBy, yoyQuarter, validateIpab, IPAB_AREE } = await import('../scripts/update-istat.mjs');
  const xml = `<Series FREQ="Q" REF_AREA="ITC" DATA_TYPE="105" MEASURE="4" PURCHASES_DWELLINGS="EXST_DW">
<Obs TIME_PERIOD="2025-Q2" OBS_VALUE="100.2" /><Obs TIME_PERIOD="2026-Q2" OBS_VALUE="103.5" /></Series>
<Series FREQ="Q" REF_AREA="ITE43" DATA_TYPE="105" MEASURE="4" PURCHASES_DWELLINGS="EXST_DW"><Obs TIME_PERIOD="2026-Q2" OBS_VALUE="105.3"/></Series>`;
  const s = parseSeriesBy(xml, 'REF_AREA');
  assert.deepEqual(s, { ITC: { '2025-Q2': 100.2, '2026-Q2': 103.5 }, ITE43: { '2026-Q2': 105.3 } });
  assert.equal(yoyQuarter(s.ITC, '2026-Q2'), 3.3);

  const full: Record<string, Record<string, number>> = {};
  for (const code of Object.keys(IPAB_AREE)) {
    full[code] = {};
    for (let i = 0; i < 24; i++) full[code][`${2021 + Math.floor(i / 4)}-Q${(i % 4) + 1}`] = 90 + i;
  }
  assert.doesNotThrow(() => validateIpab(full, new Date('2026-10-01')));
  assert.throws(() => validateIpab(full, new Date('2028-01-01')), /troppo vecchio/);
  const { ITC: _omit, ...missing } = full;
  assert.throws(() => validateIpab(missing, new Date('2026-10-01')), /mancante/);
});

test('NIC per voce di spesa: lettura, variazioni mensili e controlli', () => {
  const xml = ['04510', '04311', '04320']
    .map(
      (c, i) => `<Series FREQ="M" REF_AREA="IT" DATA_TYPE="85" MEASURE="4" ECOICOP_2="${c}">
<Obs TIME_PERIOD="2026-01" OBS_VALUE="${100 + i}" /><Obs TIME_PERIOD="2026-02" OBS_VALUE="${101 + i}" /></Series>`,
    )
    .join('');
  const byCode = parseSeriesBy(xml, 'ECOICOP_2') as Record<string, Record<string, number>>;
  assert.deepEqual(byCode['04311'], { '2026-01': 101, '2026-02': 102 });
  assert.equal(mom(byCode['04510'], '2026-02'), 1);
  assert.equal(mom({ '2025-12': 100, '2026-01': 100.4 }, '2026-01'), 0.4);
  assert.equal(mom(byCode['04510'], '2026-01'), null);

  const today = new Date('2026-04-10');
  validatePrezzi(byCode, today);
  assert.throws(() => validatePrezzi({ ...byCode, '04320': undefined }, today), /mancante/);
  assert.throws(() => validatePrezzi({ ...byCode, '04320': { '2026-01': 100, '2026-03': 101 } }, today), /consecutivi/);
  assert.throws(() => validatePrezzi({ ...byCode, '04320': { '2026-01': 100, '2026-02': 900 } }, today), /plausibile/);
  assert.throws(() => validatePrezzi(byCode, new Date('2026-09-10')), /vecchio/);
});
