// Esplorazione temporanea dell'API SDMX ISTAT: struttura e campione dei dati FOI.
const BASE = 'https://esploradati.istat.it/SDMXWS/rest';
const XML = 'application/vnd.sdmx.structure+xml;version=2.1';
const CSV = 'application/vnd.sdmx.data+csv;version=1.0.0';
const flows = ['169_748_DF_DCSP_FOI1B2025_1', '169_748_DF_DCSP_FOI1B2025_2'];

async function get(url, accept) {
  const t = Date.now();
  const res = await fetch(url, { headers: { Accept: accept } });
  const body = await res.text();
  console.log(`GET ${url} -> ${res.status} ${body.length}B ${Date.now() - t}ms`);
  return body;
}

for (const flow of flows) {
  console.log(`\n######## ${flow}`);
  const xml = await get(`${BASE}/dataflow/IT1/${flow}/1.0?references=all`, XML);
  // Dimensioni in ordine
  const dims = [...xml.matchAll(/<structure:Dimension\b[^>]*\bid="([^"]+)"[^>]*position="(\d+)"[\s\S]*?<Ref [^>]*id="([^"]+)"[^>]*class="Codelist"/g)];
  for (const d of dims) console.log(`DIM ${d[2]} ${d[1]} codelist=${d[3]}`);
  const dims2 = [...xml.matchAll(/<structure:(?:Dimension|TimeDimension)\b([^>]*)>/g)].map((m) => m[1]);
  console.log('DIM attrs:', dims2.join(' || '));
  // Constraint (codici effettivamente usati)
  const cons = [...xml.matchAll(/<common:KeyValue id="([^"]+)">([\s\S]*?)<\/common:KeyValue>/g)];
  for (const c of cons) {
    const vals = [...c[2].matchAll(/<common:Value>([^<]*)<\/common:Value>/g)].map((v) => v[1]);
    console.log(`CONSTRAINT ${c[1]}: ${vals.length} -> ${vals.slice(0, 60).join(',')}`);
  }
  // Codelist piccole con etichette
  for (const cl of xml.matchAll(/<structure:Codelist\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/structure:Codelist>/g)) {
    const codes = [...cl[2].matchAll(/<structure:Code\b[^>]*\bid="([^"]+)"[^>]*>[\s\S]*?<common:Name xml:lang="it">([^<]*)<\/common:Name>/g)];
    const sample = codes.filter((c) => codes.length <= 40 || /^(00|0|FOI|ST|NT|T)/.test(c[1]) || /tabacc|indice generale|totale/i.test(c[2])).slice(0, 40);
    console.log(`CODELIST ${cl[1]} (${codes.length}): ${sample.map((c) => `${c[1]}=${c[2]}`).join(' ; ')}`);
  }
  const csv = await get(`${BASE}/data/IT1,${flow},1.0/all?lastNObservations=2`, CSV);
  const lines = csv.split('\n');
  console.log(`CSV lines: ${lines.length}`);
  console.log(lines.slice(0, 5).join('\n'));
  const interesting = lines.filter((l) => /tabac|00ST|ST|NT/i.test(l)).slice(0, 30);
  console.log('--- righe con codici candidati:');
  console.log(interesting.join('\n'));
}
