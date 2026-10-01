// Esplorazione temporanea v4: identificativi IPAB via DBnomics, poi dati da ISTAT.
const T = (ms) => AbortSignal.timeout(ms);
async function json(url) {
  try {
    const r = await fetch(url, { signal: T(90000) });
    console.log(`GET ${url} -> ${r.status}`);
    return await r.json();
  } catch (e) { console.log(`GET ${url} ERROR ${e}`); return null; }
}
const codes = new Set();
for (let offset = 0; offset < 6000; offset += 1000) {
  const d = await json(`https://api.db.nomics.world/v22/datasets/ISTAT?limit=1000&offset=${offset}`);
  const docs = d?.datasets?.docs ?? [];
  for (const x of docs) {
    if (/IPAB|abitazion/i.test(`${x.code} ${x.name}`)) {
      console.log(`DATASET ${x.code} | ${x.name} | series=${x.nb_series}`);
      if (/IPAB/i.test(x.code)) codes.add(x.code);
    }
  }
  if (docs.length < 1000) break;
}
const s2 = await json('https://api.db.nomics.world/v22/search?q=IPAB%20ISTAT&limit=30');
for (const x of s2?.results?.docs ?? []) console.log(`SEARCH ${x.provider_code}/${x.code} | ${x.name}`);
for (const code of codes) {
  const d = await json(`https://api.db.nomics.world/v22/series/ISTAT/${code}?observations=1&limit=200&offset=0`);
  const docs = d?.series?.docs ?? [];
  console.log(`\n##### ${code}: ${d?.series?.num_found} serie`);
  for (const s of docs) {
    const n = s.period?.length ?? 0;
    console.log(`${s.series_code} | ${s.series_name} | ${s.period?.[n - 1]}=${s.value?.[n - 1]} | first ${s.period?.[0]}`);
  }
  // Prova anche la stessa serie direttamente sull'ISTAT
  try {
    const r = await fetch(`https://esploradati.istat.it/SDMXWS/rest/data/IT1,${code},1.0/all?startPeriod=2026-Q1`, {
      headers: { Accept: 'application/vnd.sdmx.structurespecificdata+xml;version=2.1' }, signal: T(120000),
    });
    const body = await r.text();
    const series = [...body.matchAll(/<Series ([^>]*)>/g)].map((m) => m[1]);
    console.log(`ISTAT ${code} -> ${r.status}, ${series.length} serie; esempio: ${series.slice(0, 5).join(' || ')}`);
  } catch (e) { console.log(`ISTAT ${code} ERROR ${e}`); }
}
