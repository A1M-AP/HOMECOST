// Esplorazione temporanea v5: dataflow IPAB 143_497_DF_DCSP_IPAB_*.
const BASE = 'https://esploradati.istat.it/SDMXWS/rest';
const XMLS = 'application/vnd.sdmx.structure+xml;version=2.1';
const DATA = 'application/vnd.sdmx.structurespecificdata+xml;version=2.1';
async function get(url, accept, ms = 120000) {
  const t = Date.now();
  try {
    const r = await fetch(url, { headers: { Accept: accept }, signal: AbortSignal.timeout(ms) });
    const body = await r.text();
    console.log(`GET ${url} -> ${r.status} ${body.length}B ${Date.now() - t}ms`);
    return r.ok ? body : '';
  } catch (e) { console.log(`GET ${url} ERROR ${e}`); return ''; }
}
const db = await fetch('https://api.db.nomics.world/v22/series/ISTAT/143_497?observations=1&limit=100').then((r) => r.json()).catch(() => null);
for (const s of db?.series?.docs ?? []) {
  const n = s.period?.length ?? 0;
  console.log(`DBN ${s.series_code} | ${s.series_name} | ${s.period?.[0]}..${s.period?.[n - 1]}=${s.value?.[n - 1]}`);
}
for (const n of [1, 2, 3, 4, 5, 6]) {
  const id = `143_497_DF_DCSP_IPAB_${n}`;
  const st = await get(`${BASE}/dataflow/IT1/${id}/1.0?references=datastructure`, XMLS, 90000);
  if (!st) continue;
  const name = /<common:Name xml:lang="it">([^<]*)</.exec(st)?.[1];
  const dims = [...st.matchAll(/<structure:(?:Dimension|TimeDimension)\b[^>]*\bid="([^"]+)"[^>]*position="(\d+)"/g)].map((d) => `${d[2]}:${d[1]}`);
  console.log(`\n##### ${id} :: ${name} :: ${dims.join(' ')}`);
  const data = await get(`${BASE}/data/IT1,${id},1.0/all?startPeriod=2026-Q1`, DATA);
  for (const m of [...data.matchAll(/<Series ([^>]*)>([\s\S]*?)<\/Series>/g)].slice(0, 120)) {
    const obs = [...m[2].matchAll(/TIME_PERIOD="([^"]+)"[^>]*OBS_VALUE="([^"]+)"/g)].map((o) => `${o[1]}:${o[2]}`).join(' ');
    console.log(`${m[1]} | ${obs}`);
  }
}
