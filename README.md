# HomeCost

Sito statico di calcolatori gratuiti su casa ed energia, in italiano, per **homecost.it**.
Costruito con [Astro](https://astro.build): nessun backend, tutti i calcoli avvengono nel browser.

| Pagina | Calcolatore |
| --- | --- |
| `/quanto-vale-la-mia-casa/` | Stima del valore di mercato di una casa (quotazioni OMI + indice ISTAT) |
| `/consumo-elettrodomestici/` | Costo in bolletta di un elettrodomestico |
| `/calcolo-pittura/` | Litri e barattoli di pittura |
| `/calcolo-piastrelle/` | Piastrelle e scatole |
| `/calcolo-cartongesso/` | Lastre, guide, montanti e viti |
| `/calcolo-parquet/` | Confezioni di parquet e battiscopa |
| `/rivalutazione-istat-affitto/` | Aggiornamento ISTAT del canone con lettera scaricabile |

Pagine istituzionali: `/chi-siamo/`, `/contatti/`, `/privacy-policy/`, `/cookie-policy/`, `/note-legali/`, più `404`,
`/sitemap.xml` e `/robots.txt` generati in automatico.

---

## Avvio in locale

Requisiti: **Node.js 22.12 o successivo** (vedi `.nvmrc`).

```bash
npm install        # installa le dipendenze
npm run dev        # server di sviluppo su http://localhost:4321
npm run build      # genera il sito statico nella cartella dist/
npm run preview    # serve la build di produzione in locale
npm test           # test delle formule (node:test)
npm run check      # controllo dei tipi TypeScript e dei componenti Astro
```

## Struttura del progetto

```
public/
  data/istat-foi.json      indici ISTAT FOI (aggiornati in automatico)
  data/istat-prezzi.json   indici ISTAT NIC per voce di spesa: elettricità, materiali, manodopera (automatici)
  data/ipab.json           indice ISTAT dei prezzi delle abitazioni (automatico)
  _headers                 header HTTP e cache (Netlify e Cloudflare Pages)
  img/, favicon, og-image  immagini statiche
src/
  config/
    site.ts                dati del sito, prezzo energia predefinito, analytics, pubblicità, banner cookie
    affiliates.ts          TUTTI i link e i testi di affiliazione (file unico)
    calculators.ts         elenco dei calcolatori (menu, homepage, footer, correlati, sitemap)
    prices.ts              prezzi base di materiali e manodopera (rivalutati con gli indici ISTAT)
  lib/
    format.ts              lettura e formattazione dei numeri all'italiana
    calc/*.ts              formule pure di ogni calcolatore (testate in tests/)
  scripts/
    calc-engine.ts         validazione, ricalcolo in tempo reale, "Copia risultato", "Stampa"
    consent.ts             gestione del consenso cookie e caricamento degli script dopo il consenso
    motion.ts              animazioni (comparsa allo scroll, numeri che scorrono)
  components/              Header, Footer, AffiliateBox, ProductBox, AdSlot, FAQ, Field, CookieBanner…
  layouts/                 BaseLayout (SEO, Open Graph), CalculatorLayout, PageLayout
  pages/                   una pagina per URL
  styles/global.css        stile unico, mobile-first, senza framework
tests/calc.test.ts         test unitari delle formule
scripts/update-istat.mjs   download automatico degli indici ISTAT FOI, IPAB e NIC (usato da GitHub Actions)
scripts/build-omi.mjs      conversione dei CSV OMI in public/data/omi/
.github/workflows/         workflow giornaliero di aggiornamento ISTAT
netlify.toml               configurazione Netlify
wrangler.jsonc             configurazione Cloudflare Workers
```

Ogni calcolatore è diviso in due parti:

- **la formula** in `src/lib/calc/<nome>.ts`: funzioni pure (calcolo, testi del risultato, testo da copiare), usate sia
  in fase di build per mostrare subito un risultato d'esempio, sia nel browser;
- **la pagina** in `src/pages/`: campi del form, riquadro del risultato, testo SEO, FAQ e un piccolo script che collega
  i campi alla formula tramite `initCalculator()`.

---

## Indici ISTAT: aggiornamento automatico

Gli indici **FOI senza tabacchi** sono in `public/data/istat-foi.json` e si aggiornano da soli:

1. ogni giorno il workflow GitHub Actions `.github/workflows/istat-update.yml` esegue
   `scripts/update-istat.mjs`, che scarica gli indici dall'API ufficiale SDMX dell'ISTAT
   (<https://esploradati.istat.it/>);
2. se ci sono dati nuovi (l'ISTAT pubblica il FOI verso metà mese) il workflow fa un commit su `main`;
3. Cloudflare ripubblica il sito: il calcolatore dell'affitto usa i nuovi indici e i **prezzi di tutti i
   calcolatori vengono rivalutati** (vedi sotto).

Dettagli tecnici:

- dal 2026 l'ISTAT pubblica il FOI in **base 2025=100**; i mesi fino a dicembre 2025 (base 2015=100) sono
  riportati in base 2025 dividendoli per il **coefficiente di raccordo** (media 2025 in base 2015 ÷ 100), così
  le variazioni a cavallo del cambio di base sono corrette;
- prima di scrivere il file lo script confronta le variazioni annue calcolate con quelle **ufficiali pubblicate
  dall'ISTAT**: se non coincidono, o se i dati sono incompleti o non plausibili, termina con errore e non
  modifica nulla (GitHub ti avvisa via e-mail del workflow fallito);
- puoi lanciarlo a mano da GitHub → Actions → "Aggiorna indici ISTAT" → "Run workflow", oppure in locale con
  `node scripts/update-istat.mjs` (`--dry-run` per vedere i dati senza scrivere);
- le chiavi che iniziano con `_` sono note (fonte, base, data di aggiornamento mostrata nella pagina);
- se il mese che serve all'utente non è ancora pubblicato, la pagina permette di inserire la variazione a mano.

Aggiornamento manuale (solo se serve): scrivi `"AAAA-MM": valore` con il punto decimale, tutti nella stessa base,
e aggiorna `"_aggiornato"` (`AAAA-MM-GG`).

## Quanto vale la mia casa: dati OMI e indice ISTAT

Il calcolatore stima il valore di mercato con il metodo sintetico-comparativo:
superficie commerciale (DPR 138/1998) × quotazione OMI della zona × coefficienti (stato, piano, classe energetica)
× aggiornamento con l'indice ISTAT dei prezzi delle abitazioni esistenti (IPAB).

**Quotazioni OMI** (`public/data/omi/`): un file JSON per provincia con, per ogni comune e zona OMI, il prezzo
minimo e massimo al m² di abitazioni civili, economiche, signorili, ville e box (stato "normale"). Sono generati da
`scripts/build-omi.mjs` a partire dai CSV ufficiali dell'Agenzia delle Entrate. Attualmente contengono il
**2° semestre 2018**, l'ultimo semestre disponibile senza credenziali (raccolta di [onData](https://github.com/ondata/quotazioni-immobiliari-agenzia-entrate)).

Per usare un semestre recente (consigliato, gratuito):

1. accedi all'area riservata dell'Agenzia delle Entrate (SPID/CIE) → Servizi → "Forniture dati OMI" →
   "Quotazioni immobiliari" e scarica l'ultimo semestre per tutta Italia;
2. esegui `node scripts/build-omi.mjs QI_..._VALORI.csv QI_..._ZONE.csv`;
3. fai commit di `public/data/omi/`: il sito usa subito il nuovo semestre e l'aggiornamento ISTAT riparte da lì.

Fonte da citare (già indicata nella pagina): "Agenzia Entrate - OMI". La licenza dei dati OMI non è una licenza
aperta standard: verifica le condizioni d'uso dell'Agenzia per un sito con pubblicità.

**Aggiornamento automatico** (`public/data/ipab.json`): lo stesso workflow giornaliero degli indici FOI scarica
dall'API ISTAT l'indice IPAB delle abitazioni esistenti per Nord-ovest, Nord-est, Centro, Sud e Isole, Roma, Milano
e Torino. A ogni nuova pubblicazione trimestrale le quotazioni OMI vengono riportate all'ultimo trimestre:
`quotazione aggiornata = quotazione OMI × IPAB ultimo trimestre ÷ IPAB medio del semestre OMI`.

## Prezzi e stime di spesa

I calcolatori di pittura, piastrelle, cartongesso, parquet e consumi mostrano la **spesa dei materiali** e, dove
serve un professionista, la **spesa con la posa** (manodopera di imbianchino, piastrellista, cartongessista,
posatore). Sono prezzi medi indicativi che l'utente può modificare o svuotare (per esempio se fa da sé).

I prezzi base sono in **`src/config/prices.ts`**, riferiti al mese `PRICE_BASE_MONTH`. L'ISTAT non pubblica
prezzi in euro di questi prodotti ma **indici dei prezzi**: a ogni build ogni prezzo viene rivalutato con l'indice
della sua voce di spesa, dal mese base all'ultimo mese disponibile:

```
prezzo mostrato = prezzo base × (indice ultimo mese ÷ indice del mese dei prezzi base)
```

| Prezzi                                  | Indice ISTAT NIC (base 2025, `public/data/istat-prezzi.json`)                     |
| --------------------------------------- | --------------------------------------------------------------------------------- |
| Energia elettrica (€/kWh)               | 04510 Elettricità                                                                  |
| Pittura, piastrelle, cartongesso, parquet, battiscopa | 04311 Prodotti per la manutenzione e la riparazione dell'abitazione |
| Manodopera (posa e montaggio)           | 04320 Servizi per la manutenzione e la riparazione dell'abitazione                 |

Gli indici NIC si scaricano ogni giorno con lo stesso workflow del FOI (dataflow `167_745_DF_DCSP_NIC1B2025_4`); prima
di salvarli lo script confronta le variazioni mensili con quelle ufficiali ISTAT. Se l'indice di una voce manca
per il mese base si usa l'indice generale FOI. Finché l'indice del mese base non è pubblicato il coefficiente vale 1.
Se aggiorni i prezzi base con listini reali, aggiorna anche `PRICE_BASE_MONTH`.

## Link di affiliazione

Tutto è in **`src/config/affiliates.ts`**:

- `AMAZON_TAG`: il tuo ID di tracciamento Amazon (es. `homecost-21`). Sostituisce `AFFILIATE_TAG` in tutti i link
  `amazon.it/...&tag=...`.
- `AFFILIATE_BOXES`: i box "call to action". `energia` compare sotto il calcolatore dei consumi
  ("Stai pagando troppo l'energia? Confronta le offerte luce e gas"); `assicurazioneCasa` (sotto il calcolatore
  ISTAT) è al momento disattivato.
  Per ognuno puoi cambiare titolo, testo, pulsante e URL, o nasconderlo con `enabled: false`.
- `PRODUCTS`: le 3 schede "Prodotti consigliati" di pittura, piastrelle, cartongesso e parquet. Per ogni prodotto:
  - `query`: ricerca su Amazon (predefinita);
  - `asin` (facoltativo): link diretto alla scheda prodotto;
  - `url` (facoltativo): qualsiasi URL completo, ha la precedenza;
  - `image` (facoltativo): immagine in `public/` (consigliata 320×240); altrimenti si usa il segnaposto.
- `AFFILIATE_DISCLOSURE` e `AMAZON_DISCLOSURE`: testi di trasparenza mostrati vicino ai link e nel footer.

I link affiliati hanno `rel="sponsored nofollow noopener"` e si aprono in una nuova scheda.

## Pubblicità e statistiche

In **`src/config/site.ts`**:

- `ADS.adsenseClient` (es. `ca-pub-1234567890123456`) e `ADS.slots.result` / `ADS.slots.sidebar` (ID delle unità
  pubblicitarie). Finché sono vuoti vengono mostrati solo i segnaposto. `ADS.enabled = false` rimuove gli spazi.
- `ANALYTICS.ga4Id` (es. `G-XXXXXXXXXX`) per Google Analytics 4.

Gli spazi pubblicitari hanno **dimensioni fisse** (300 px sotto il risultato, 620 px nella colonna laterale visibile
solo da desktop), quindi l'arrivo dell'annuncio non sposta il layout (CLS zero). Script di pubblicità e statistiche
vengono caricati **solo dopo il consenso** della relativa categoria.

Per AdSense ricorda anche:

- il file `public/ads.txt` con la riga fornita da AdSense (es. `google.com, pub-XXXXXXXXXXXXXXXX, DIRECT, f08c47fec0942fa0`);
- per mostrare annunci agli utenti di SEE e Regno Unito, Google richiede una **CMP certificata** integrata con lo
  standard IAB TCF. Il banner incluso gestisce correttamente il consenso agli script, ma non è una CMP certificata:
  quando attivi AdSense valuta di sostituirlo (ad esempio con la soluzione "Privacy e messaggi" di Google o una CMP
  commerciale) e aggiorna la cookie policy.

## Banner cookie

Il banner (`src/components/CookieBanner.astro` + `src/scripts/consent.ts`) segue le linee guida del Garante Privacy:

- pulsanti **Accetta** e **Rifiuta** con lo stesso stile, più "Personalizza" per categoria (statistiche, pubblicità);
- la **X** chiude il banner senza accettare (equivale a rifiutare);
- nessun cookie non tecnico prima della scelta; la scelta è salvata in `localStorage` (dato tecnico) e scade dopo
  `CONSENT.maxAgeDays` giorni (180);
- link "Preferenze cookie" nel footer per cambiare idea in qualsiasi momento; se un consenso viene revocato, i cookie
  di Google più comuni vengono cancellati e la pagina ricaricata.

Se cambi finalità o fornitori, aumenta `CONSENT.version`: il banner verrà riproposto a tutti.
Per bloccare altri script fino al consenso usa:

```html
<script type="text/plain" data-consent-category="analytics">/* ... */</script>
<script type="text/plain" data-consent-category="ads" src="https://..."></script>
```

## Pubblicazione

Il sito è una cartella statica (`dist/`): funziona su qualsiasi hosting statico.

### Netlify

1. "Add new site" → "Import an existing project" e collega il repository.
2. Le impostazioni sono già in `netlify.toml` (comando `npm run build`, cartella `dist`, Node 22).
3. In "Domain management" aggiungi `homecost.it` e attiva HTTPS.

### Cloudflare Workers (importazione del repository)

È il percorso proposto oggi da Cloudflare con "Workers & Pages" → "Create" → "Import a repository".
La configurazione è in `wrangler.jsonc`: cartella `dist/` come file statici, pagina `404.html` per gli indirizzi
inesistenti e build automatica (`npm run build`) prima di ogni deploy.

1. Importa il repository e lascia il comando di deploy predefinito `npx wrangler deploy`
   (il comando di build può restare vuoto oppure essere `npm run build`).
2. Il **nome del Worker** deve coincidere con `"name"` in `wrangler.jsonc` (`homecost`): se nella dashboard ne hai
   scelto un altro, cambia uno dei due.
3. Il branch di produzione è `main`: pubblica solo dopo aver unito lì il codice del sito.
4. Se serve, aggiungi la variabile d'ambiente `NODE_VERSION = 22` (Astro richiede Node 22.12 o successivo).
5. In "Settings" → "Domains & Routes" collega `homecost.it`.

Per provare in locale la versione servita da Cloudflare: `npx wrangler dev`.

### Cloudflare Pages (alternativa)

1. "Workers & Pages" → "Create" → "Pages" → collega il repository.
2. Preset framework **Astro**, comando di build `npm run build`, cartella di output `dist`.
3. Aggiungi la variabile d'ambiente `NODE_VERSION = 22`.
4. In "Custom domains" collega `homecost.it`.

Il file `public/_headers` (cache lunga per `/_astro/*`, breve per `/data/*`, header di sicurezza) è letto da Netlify,
Cloudflare Pages e Cloudflare Workers. Gli URL terminano con `/` e sono generati come `cartella/index.html`: non
servono redirect.

Dopo la pubblicazione, invia `https://homecost.it/sitemap.xml` a Google Search Console.

### Prima del lancio: checklist

- [ ] `AMAZON_TAG` e URL dei box di affiliazione (ora puntano a `example.com`) in `src/config/affiliates.ts`
- [ ] Prezzi base indicativi in `src/config/prices.ts` (verificali con listini reali)
- [ ] E-mail e dati del titolare (`src/config/site.ts`, `/contatti/`, pagine legali)
- [ ] Testi di privacy policy, cookie policy e note legali: completare le parti `[DA COMPLETARE]` e farle verificare
- [ ] ID AdSense / Analytics (facoltativi) e, per AdSense, `ads.txt` e CMP certificata
- [ ] Immagini reali dei prodotti (facoltative)
- [ ] Prezzo indicativo dell'energia `ENERGY_PRICE_DEFAULT` in `src/config/site.ts`

---

## Aggiungere un calcolatore

1. Scrivi la formula in `src/lib/calc/nuovo.ts` (funzioni `calc…`, `present…`, `summary…`) e i test in `tests/`.
2. Aggiungi la voce in `src/config/calculators.ts` (menu, homepage, footer e sitemap si aggiornano da soli) e
   un'icona in `src/components/Icon.astro`.
3. Crea `src/pages/<url>.astro` partendo da una pagina esistente: `CalculatorLayout` + campi `Field` + riquadro con
   elementi `data-out="chiave"` + script con `initCalculator()`.

I campi numerici accettano la virgola decimale e il punto delle migliaia (`1.500` = 1500) e vengono validati in base
agli attributi di `Field` (`positive`, `integer`, `min`, `max`, `optional`).

## Qualità

- **Test**: `npm test` verifica le formule di tutti i calcolatori (arrotondamenti, scarti, combinazioni di barattoli,
  indici ISTAT, lettera RTF).
- **Prestazioni**: nessun font esterno né framework JS; CSS inserito nella pagina e JavaScript solo per il
  calcolatore (3–7 KB compressi per pagina). Con Lighthouse in modalità mobile, sulla build servita in locale, tutte le pagine verificate ottengono
  100 in Performance, Accessibilità, Best practice e SEO, con CLS 0. In produzione i valori dipendono anche
  dall'hosting e dagli eventuali script pubblicitari.
- **Accessibilità**: etichette su tutti i campi, errori collegati con `aria-describedby`, risultato annunciato agli
  screen reader, navigazione da tastiera, contrasti AA.
- **SEO**: title e meta description unici, URL canonici, Open Graph e Twitter card, dati strutturati
  (`WebApplication`, `BreadcrumbList`, `FAQPage`), sitemap e robots. Nota: dal 2023 Google mostra i risultati
  arricchiti delle FAQ quasi solo per siti istituzionali e sanitari; il markup resta comunque valido.

I risultati dei calcolatori sono stime indicative e non sostituiscono il parere di un professionista.
