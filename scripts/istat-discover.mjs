// Esplorazione temporanea dell'API SDMX ISTAT: codici DATA_TYPE e campioni di dati FOI.
const BASE = 'https://esploradati.istat.it/SDMXWS/rest';
const XML = 'application/vnd.sdmx.structure+xml;version=2.1';
const CSV = 'application/vnd.sdmx.data+csv;version=1.0.0';

async function get(url, accept) {
  const t = Date.now();
  try {
    const res = await fetch(url, { headers: { Accept: accept } });
    const body = await res.text();
    console.log(`GET ${url} -> ${res.status} ${body.length}B ${Date.now() - t}ms`);
    return body;
  } catch (e) {
    console.log(`GET ${url} -> ERROR ${e}`);
    return '';
  }
}

const cl = await get(`${BASE}/codelist/IT1/CL_TIPO_DATO2`, XML);
for (const m of cl.matchAll(/<structure:Code\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/structure:Code>/g)) {
  const it = /<common:Name xml:lang="it">([^<]*)</.exec(m[2])?.[1] ?? '';
  if (/foi|tabac|operai/i.test(it + m[1])) console.log(`TIPO_DATO ${m[1]} = ${it}`);
}

const queries = [
  ['169_748_DF_DCSP_FOI1B2025_1', 'M....00', '2026-01'],
  ['169_748_DF_DCSP_FOI1B2025_2', 'M...4.00', '2024-06'],
  ['169_748_DF_DCSP_FOI1B2025_2', 'M...7.00', '2025-06'],
  ['169_745_DF_DCSP_FOI1B2015_1', 'M...4.00', '2025-06'],
];
for (const [flow, key, start] of queries) {
  const csv = await get(`${BASE}/data/IT1,${flow},1.0/${key}?startPeriod=${start}`, CSV);
  const lines = csv.split('\n').filter(Boolean);
  console.log(`--- ${flow} ${key} lines=${lines.length}`);
  console.log(lines.slice(0, 60).join('\n'));
}
