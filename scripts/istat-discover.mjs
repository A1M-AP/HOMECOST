// Esplorazione temporanea dell'API SDMX ISTAT: elenca i dataflow FOI.
const BASES = ['https://esploradati.istat.it/SDMXWS/rest', 'https://sdmx.istat.it/SDMXWS/rest'];
const ACCEPT = 'application/vnd.sdmx.structure+xml;version=2.1';
for (const base of BASES) {
  try {
    const res = await fetch(`${base}/dataflow/IT1`, { headers: { Accept: ACCEPT } });
    const xml = await res.text();
    console.log(`== ${base} status=${res.status} bytes=${xml.length}`);
    const re = /<structure:Dataflow\b([^>]*)>([\s\S]*?)<\/structure:Dataflow>/g;
    let m, n = 0;
    while ((m = re.exec(xml))) {
      n++;
      const attrs = m[1];
      const id = /\bid="([^"]+)"/.exec(attrs)?.[1];
      const ver = /\bversion="([^"]+)"/.exec(attrs)?.[1];
      const names = [...m[2].matchAll(/<common:Name xml:lang="(\w+)">([^<]*)<\/common:Name>/g)].map((x) => `${x[1]}:${x[2]}`);
      const all = names.join(' | ');
      if (/\bFOI\b|operai e impiegati|blue and white/i.test(all + id)) console.log(`${id} v${ver} :: ${all}`);
    }
    console.log(`total dataflows: ${n}`);
  } catch (e) {
    console.log(`== ${base} ERROR ${e}`);
  }
}
