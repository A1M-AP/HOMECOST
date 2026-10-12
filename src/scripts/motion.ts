/**
 * Animazioni leggere dell'interfaccia.
 * - comparsa graduale dei blocchi sotto la piega quando entrano nello schermo;
 * - numeri dei risultati che "scorrono" verso il nuovo valore;
 * - evidenziazione dei valori che cambiano.
 * Tutto viene disattivato se il sistema chiede di ridurre il movimento.
 * Gli elementi già visibili al caricamento non vengono mai nascosti (nessun impatto su LCP/CLS).
 */

export const reducedMotion = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/* --- Comparsa allo scroll ---------------------------------------------------- */

const REVEAL_SELECTOR = [
  '.calc-grid > li',
  '.features > li',
  '.product-grid > li',
  '.prose > h2',
  '.prose > .formula',
  '.prose > .steps',
  '.prose > .table-wrap',
  '.faq',
  '.related > h2',
  '.affiliate-box',
  '.products > h2',
  '.letter',
  '.section > h2',
].join(',');

export function initReveal(): void {
  if (reducedMotion() || !('IntersectionObserver' in window)) return;
  const fold = window.innerHeight;
  const targets = [...document.querySelectorAll<HTMLElement>(REVEAL_SELECTOR)].filter(
    (el) => el.getBoundingClientRect().top > fold,
  );
  if (!targets.length) return;
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-visible');
        io.unobserve(entry.target);
      }
    },
    { rootMargin: '0px 0px -8% 0px' },
  );
  for (const el of targets) {
    // Piccolo ritardo a cascata per gli elementi di una stessa griglia
    const index = el.parentElement ? [...el.parentElement.children].indexOf(el) : 0;
    if (el.tagName === 'LI') el.style.setProperty('--reveal-delay', `${Math.min(index, 5) * 70}ms`);
    el.classList.add('reveal');
    io.observe(el);
  }
}

/* --- Numeri animati ---------------------------------------------------------- */

// Primo numero nel testo, formato italiano (1.234,56 / −3,5 / 12)
const NUM_RE = /[−-]?\d{1,3}(?:\.\d{3})+(?:,\d+)?|[−-]?\d+(?:,\d+)?/;
const running = new WeakMap<HTMLElement, number>();

function parseIt(token: string): number {
  return Number(token.replace(/\./g, '').replace(',', '.').replace('−', '-'));
}

function flash(el: HTMLElement): void {
  el.classList.remove('is-updated');
  void el.offsetWidth; // riavvia l'animazione CSS
  el.classList.add('is-updated');
}

/**
 * Imposta il testo di un risultato: se è un valore principale (dentro .kpi) il numero
 * scorre dal valore precedente al nuovo; gli altri valori vengono solo evidenziati.
 */
export function setResultText(el: HTMLElement, text: string): void {
  const previous = el.textContent ?? '';
  if (previous === text) return;
  const cancel = running.get(el);
  if (cancel) cancelAnimationFrame(cancel);

  const to = NUM_RE.exec(text);
  const from = NUM_RE.exec(previous);
  if (reducedMotion() || !el.closest('.kpi') || !to || !from) {
    el.textContent = text;
    if (!reducedMotion()) flash(el);
    return;
  }

  const start = parseIt(from[0]);
  const end = parseIt(to[0]);
  const decimals = to[0].includes(',') ? to[0].split(',')[1].length : 0;
  const before = text.slice(0, to.index);
  const after = text.slice(to.index + to[0].length);
  const nf = new Intl.NumberFormat('it-IT', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  const duration = 450;
  const t0 = performance.now();

  const step = (now: number) => {
    const t = Math.min(1, (now - t0) / duration);
    const eased = 1 - (1 - t) ** 3;
    if (t < 1) {
      el.textContent = `${before}${nf.format(start + (end - start) * eased)}${after}`;
      running.set(el, requestAnimationFrame(step));
    } else {
      el.textContent = text; // valore finale esatto
      running.delete(el);
    }
  };
  running.set(el, requestAnimationFrame(step));
  flash(el.closest('.kpi') as HTMLElement);
}
