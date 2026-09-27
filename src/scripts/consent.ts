/**
 * Gestione del consenso ai cookie (GDPR e Linee guida del Garante Privacy, 10 giugno 2021).
 *
 * - Prima della scelta non viene caricato alcuno script di statistica o pubblicità.
 * - "Accetta" e "Rifiuta" hanno la stessa evidenza; la X chiude il banner rifiutando.
 * - La scelta (dato tecnico) è salvata in localStorage e scade dopo `maxAgeDays` giorni.
 * - Script aggiuntivi possono essere bloccati fino al consenso con:
 *   <script type="text/plain" data-consent-category="analytics|ads">…</script>
 */

export {};

type Category = 'analytics' | 'ads';

interface Consent {
  v: number;
  ts: number;
  analytics: boolean;
  ads: boolean;
}

interface Config {
  consent: { version: number; maxAgeDays: number; storageKey: string };
  analytics: { ga4Id: string };
  ads: { client: string; slots: Record<string, string> };
}

declare global {
  interface Window {
    dataLayer: unknown[];
    adsbygoogle: unknown[];
    HomeCost?: { consent: () => Consent | null; openPreferences: () => void };
  }
}

const cfgEl = document.getElementById('hc-config');
const cfg: Config = JSON.parse(cfgEl?.textContent || '{}');
const loaded: Record<Category, boolean> = { analytics: false, ads: false };

function readConsent(): Consent | null {
  try {
    const raw = localStorage.getItem(cfg.consent.storageKey);
    if (!raw) return null;
    const c = JSON.parse(raw) as Consent;
    if (c.v !== cfg.consent.version) return null;
    if (Date.now() - c.ts > cfg.consent.maxAgeDays * 86_400_000) return null;
    return c;
  } catch {
    return null;
  }
}

function saveConsent(c: Consent): void {
  try {
    localStorage.setItem(cfg.consent.storageKey, JSON.stringify(c));
  } catch {
    /* archiviazione non disponibile: la scelta vale solo per questa pagina */
  }
}

function injectScript(src: string, attrs: Record<string, string> = {}): void {
  const s = document.createElement('script');
  s.async = true;
  s.src = src;
  for (const [k, v] of Object.entries(attrs)) s.setAttribute(k, v);
  document.head.appendChild(s);
}

function loadAnalytics(): void {
  const id = cfg.analytics.ga4Id;
  if (loaded.analytics || !id) return;
  loaded.analytics = true;
  injectScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`);
  window.dataLayer = window.dataLayer || [];
  // eslint-disable-next-line prefer-rest-params
  const gtag = function (..._args: unknown[]) { window.dataLayer.push(arguments); };
  gtag('js', new Date());
  gtag('config', id);
}

function isVisible(el: HTMLElement): boolean {
  return el.getClientRects().length > 0;
}

function loadAds(): void {
  const client = cfg.ads.client;
  if (loaded.ads || !client) return;
  const slots = [...document.querySelectorAll<HTMLElement>('[data-ad-placement]')].filter(
    (el) => isVisible(el) && cfg.ads.slots[el.dataset.adPlacement || ''],
  );
  if (!slots.length) return;
  loaded.ads = true;
  injectScript(`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`, {
    crossorigin: 'anonymous',
  });
  window.adsbygoogle = window.adsbygoogle || [];
  for (const slot of slots) {
    const inner = slot.querySelector('.ad-inner');
    if (!inner) continue;
    const ins = document.createElement('ins');
    ins.className = 'adsbygoogle';
    ins.style.cssText = 'display:block;width:100%;height:100%';
    ins.dataset.adClient = client;
    ins.dataset.adSlot = cfg.ads.slots[slot.dataset.adPlacement!];
    inner.replaceChildren(ins);
    window.adsbygoogle.push({});
  }
}

/** Attiva gli script bloccati con type="text/plain" per le categorie accettate. */
function activateBlockedScripts(c: Consent): void {
  document.querySelectorAll<HTMLScriptElement>('script[type="text/plain"][data-consent-category]').forEach((old) => {
    const cat = old.dataset.consentCategory as Category;
    if (!c[cat]) return;
    const s = document.createElement('script');
    for (const { name, value } of [...old.attributes]) {
      if (name !== 'type' && name !== 'data-consent-category') s.setAttribute(name, value);
    }
    s.text = old.text;
    old.replaceWith(s);
  });
}

function apply(c: Consent): void {
  if (c.analytics) loadAnalytics();
  if (c.ads) loadAds();
  activateBlockedScripts(c);
  document.dispatchEvent(new CustomEvent('homecost:consent', { detail: c }));
}

/** Cancella i cookie di terze parti più comuni impostati sul dominio del sito. */
function clearTrackingCookies(): void {
  const names = document.cookie.split(';').map((c) => c.split('=')[0].trim());
  const host = location.hostname;
  const domains = ['', host, `.${host}`, `.${host.split('.').slice(-2).join('.')}`];
  for (const name of names) {
    if (!/^(_ga|_gid|_gat|_gcl|__gads|__gpi|__eoi|FCNEC)/.test(name)) continue;
    for (const d of domains) {
      document.cookie = `${name}=; Max-Age=0; path=/${d ? `; domain=${d}` : ''}`;
    }
  }
}

/* --- Banner -------------------------------------------------------------- */

const banner = document.getElementById('cookie-banner');
const prefs = banner?.querySelector<HTMLElement>('.cb-prefs');
const saveBtn = banner?.querySelector<HTMLElement>('[data-consent="save"]');
const moreBtn = banner?.querySelector<HTMLElement>('[data-consent="customize"]');
const checks = {
  analytics: banner?.querySelector<HTMLInputElement>('input[name="cb-analytics"]'),
  ads: banner?.querySelector<HTMLInputElement>('input[name="cb-ads"]'),
};
let returnFocus: HTMLElement | null = null;

function showBanner(customize: boolean, focus: boolean): void {
  if (!banner) return;
  const current = readConsent();
  if (checks.analytics) checks.analytics.checked = !!current?.analytics;
  if (checks.ads) checks.ads.checked = !!current?.ads;
  if (prefs) prefs.hidden = !customize;
  if (saveBtn) saveBtn.hidden = !customize;
  if (moreBtn) moreBtn.hidden = customize;
  banner.hidden = false;
  if (focus) banner.querySelector<HTMLElement>(customize ? 'input' : 'button[data-consent="reject"]')?.focus();
}

function hideBanner(): void {
  if (!banner) return;
  banner.hidden = true;
  returnFocus?.focus();
  returnFocus = null;
}

function decide(choice: { analytics: boolean; ads: boolean }): void {
  const previous = readConsent();
  const next: Consent = { v: cfg.consent.version, ts: Date.now(), ...choice };
  saveConsent(next);
  hideBanner();
  const revoked = previous && ((previous.analytics && !choice.analytics) || (previous.ads && !choice.ads));
  if (revoked) {
    // Gli script già caricati non si possono "scaricare": si puliscono i cookie e si ricarica la pagina.
    clearTrackingCookies();
    location.reload();
    return;
  }
  apply(next);
}

banner?.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-consent]');
  if (!btn) return;
  switch (btn.dataset.consent) {
    case 'accept':
      decide({ analytics: true, ads: true });
      break;
    case 'reject':
      decide({ analytics: false, ads: false });
      break;
    case 'customize':
      showBanner(true, true);
      break;
    case 'save':
      decide({ analytics: !!checks.analytics?.checked, ads: !!checks.ads?.checked });
      break;
  }
});

banner?.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && readConsent()) hideBanner();
});

function openPreferences(): void {
  returnFocus = document.activeElement as HTMLElement | null;
  showBanner(true, true);
}

document.addEventListener('click', (e) => {
  if ((e.target as HTMLElement).closest('[data-consent-open]')) {
    e.preventDefault();
    openPreferences();
  }
});

window.HomeCost = { consent: readConsent, openPreferences };

const stored = readConsent();
if (stored) apply(stored);
else showBanner(false, false);
