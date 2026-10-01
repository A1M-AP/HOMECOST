// Esplorazione temporanea: dataflow ISTAT sui prezzi delle abitazioni (IPAB). v2
const BASE = 'https://esploradati.istat.it/SDMXWS/rest';
const XMLS = 'application/vnd.sdmx.structure+xml;version=2.1';
const DATA = 'application/vnd.sdmx.genericdata+xml;version=2.1';
async function get(url, accept) {
  const t = Date.now();
  try {
    const res = await fetch(url, { headers: { Accept: accept }, signal: AbortSignal.timeout(60000) });
    const body = await res.text();
    console.log(`GET ${url} -> ${res.status} ${body.length}B ${Date.now() - t}ms`);
    return body;
  } catch (e) { console.log(`GET ${url} ERROR ${e}`); return ''; }
}
const xml = await get(`${BASE}/dataflow/IT1`, XMLS);
const flows = [];
for (const m of xml.matchAll(/<structure:Dataflow\b([^>]*)>([\s\S]*?)<\/structure:Dataflow>/g)) {
  const id = /\bid="([^"]+)"/.exec(m[1])?.[1];
  const it = /<common:Name xml:lang="it">([^<]*)</.exec(m[2])?.[1] ?? '';
  if (/abitazion|IPAB|immobil/i.test(it + id) && /prezz|IPAB/i.test(it + id)) { flows.push(id); console.log(`FLOW ${id} :: ${it}`); }
}
for (const id of flows.filter((f) => /_DF_/.test(f)).slice(0, 6)) {
  console.log(`\n##### ${id}`);
  const st = await get(`${BASE}/dataflow/IT1/${id}/1.0?references=datastructure`, XMLS);
  const dims = [...st.matchAll(/<structure:(?:Dimension|TimeDimension)\b[^>]*\bid="([^"]+)"[^>]*position="(\d+)"/g)].map((d) => `${d[2]}:${d[1]}`);
  console.log('DIMS', dims.join(' '));
  const data = await get(`${BASE}/data/IT1,${id},1.0/all?startPeriod=2026-Q1&endPeriod=2026-Q2`, DATA);
  const series = [...data.matchAll(/<generic:SeriesKey>([\s\S]*?)<\/generic:SeriesKey>([\s\S]*?)<\/generic:Series>/g)];
  console.log(`series: ${series.length}`);
  for (const s of series.slice(0, 80)) {
    const key = [...s[1].matchAll(/id="([^"]+)" value="([^"]+)"/g)].map((v) => `${v[1]}=${v[2]}`).join(',');
    const obs = [...s[2].matchAll(/ObsDimension id="TIME_PERIOD" value="([^"]+)"[\s\S]*?ObsValue value="([^"]+)"/g)].map((o) => `${o[1]}:${o[2]}`).join(' ');
    console.log(`${key} | ${obs}`);
  }
}
