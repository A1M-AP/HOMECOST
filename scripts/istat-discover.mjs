// Esplorazione temporanea dell'API SDMX ISTAT: codice "senza tabacchi" e formato dei dati.
const BASE = 'https://esploradati.istat.it/SDMXWS/rest';
const XML = 'application/vnd.sdmx.structure+xml;version=2.1';

async function get(url, accept) {
  const t = Date.now();
  try {
    const res = await fetch(url, accept ? { headers: { Accept: accept } } : {});
    const body = await res.text();
    console.log(`GET ${url} [${accept ?? 'default'}] -> ${res.status} ${res.headers.get('content-type')} ${body.length}B ${Date.now() - t}ms`);
    return body;
  } catch (e) {
    console.log(`GET ${url} -> ERROR ${e}`);
    return '';
  }
}

const cl = await get(`${BASE}/codelist/IT1/CL_ECOICOP_2`, XML);
for (const m of cl.matchAll(/<structure:Code\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/structure:Code>/g)) {
  const it = /<common:Name xml:lang="it">([^<]*)</.exec(m[2])?.[1] ?? '';
  if (/tabac|senza|netto|esclus|general/i.test(it) || /^00/.test(m[1])) console.log(`ECOICOP ${m[1]} = ${it}`);
}

const flow1 = 'IT1,169_748_DF_DCSP_FOI1B2025_1,1.0';
const flow2 = 'IT1,169_748_DF_DCSP_FOI1B2025_2,1.0';
const tries = [
  [`${BASE}/data/${flow1}/M.IT.101.4.00?startPeriod=2026-01`, 'application/vnd.sdmx.structurespecificdata+xml;version=2.1'],
  [`${BASE}/data/${flow1}/M.IT.101.4.00?startPeriod=2026-01`, 'application/vnd.sdmx.genericdata+xml;version=2.1'],
  [`${BASE}/data/${flow1}/M.IT.101.4.00?startPeriod=2026-01&format=csvdata`, null],
  [`${BASE}/data/${flow1}/M.IT.101.4.00?startPeriod=2026-01`, 'text/csv'],
  [`${BASE}/data/${flow1}/M..101..00?startPeriod=2026-01`, 'application/vnd.sdmx.genericdata+xml;version=2.1'],
  [`${BASE}/data/${flow2}/M.IT..4.00?startPeriod=2025-01`, 'application/vnd.sdmx.genericdata+xml;version=2.1'],
];
for (const [url, accept] of tries) {
  const body = await get(url, accept);
  console.log(body.slice(0, 2500).replace(/\s+/g, ' '));
  console.log('-----');
}
