/**
 * Lettura e formattazione dei numeri all'italiana (virgola decimale, punto per le migliaia).
 * Usato sia in fase di build (risultati iniziali) sia nel browser.
 */

// 1.500 / 12.000 / 1.234,56 → separatore delle migliaia (non si applica a 0.250)
const THOUSANDS_RE = /^[+-]?[1-9]\d{0,2}(\.\d{3})+(,\d+)?$/;
const DECIMAL_RE = /^[+-]?(\d+([.,]\d*)?|[.,]\d+)$/;

/**
 * Converte il testo digitato in numero.
 * @returns null se il campo è vuoto, NaN se il testo non è un numero valido.
 */
export function parseNumber(raw: string): number | null {
  let s = raw.trim().replace(/[\s €%]/g, '');
  if (s === '') return null;
  if (THOUSANDS_RE.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else if (DECIMAL_RE.test(s)) s = s.replace(',', '.');
  else return NaN;
  return Number(s);
}

const cache = new Map<string, Intl.NumberFormat>();
function nf(min: number, max: number, style: 'decimal' | 'currency' = 'decimal'): Intl.NumberFormat {
  const key = `${style}:${min}:${max}`;
  let f = cache.get(key);
  if (!f) {
    f = new Intl.NumberFormat('it-IT', {
      style,
      currency: 'EUR',
      minimumFractionDigits: min,
      maximumFractionDigits: max,
      useGrouping: true,
    });
    cache.set(key, f);
  }
  return f;
}

/** Numero con al massimo `max` decimali (es. 12,5). */
export function fmt(n: number, max = 2, min = 0): string {
  return nf(min, max).format(n === 0 ? 0 : n); // evita "-0"
}

/** Importo in euro con due decimali (es. 1.234,50 €). */
export function euro(n: number): string {
  return nf(2, 2, 'currency').format(n === 0 ? 0 : n);
}

/** Numero intero con separatore delle migliaia. */
export function int(n: number): string {
  return nf(0, 0).format(n);
}

/** Valore da mostrare in un campo di input (senza separatore delle migliaia). */
export function inputValue(n: number, max = 2): string {
  return new Intl.NumberFormat('it-IT', { maximumFractionDigits: max, useGrouping: false }).format(n);
}

/** "1 barattolo" / "3 barattoli" */
export function plural(n: number, one: string, many: string): string {
  return `${int(n)} ${n === 1 ? one : many}`;
}
