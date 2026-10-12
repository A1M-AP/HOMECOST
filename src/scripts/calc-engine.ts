/**
 * Motore comune dei calcolatori: legge e valida i campi numerici, ricalcola a ogni
 * modifica, aggiorna il riquadro del risultato e gestisce "Copia risultato" e "Stampa".
 *
 * Convenzioni nel markup (vedi Field.astro e CalculatorLayout.astro):
 * - input[data-num] con data-min, data-max, data-positive, data-integer, data-optional
 * - elementi [data-out="chiave"] e [data-show="chiave"] nel riquadro del risultato
 */
import { fmt, parseNumber } from '../lib/format.ts';
import type { CalcOutcome, Presentation } from '../lib/calc/utils.ts';
import { setResultText } from './motion.ts';

export type Values = Record<string, number | null>;

export interface CalculatorSetup<I, R> {
  /** Converte i valori validati (e gli altri controlli del form) nell'input del calcolo. */
  read(values: Values, form: HTMLFormElement): I;
  compute(input: I): CalcOutcome<R>;
  present(input: I, result: R): Presentation;
  /** Testo per "Copia risultato". La prima riga utile viene annunciata agli screen reader. */
  summary(input: I, result: R): string;
  /** Frase breve annunciata agli screen reader dopo una pausa nella digitazione. */
  announce?(input: I, result: R): string;
  /** Operazioni extra dopo ogni calcolo riuscito (es. aggiornare la lettera ISTAT). */
  after?(input: I, result: R): void;
  /** Chiamato quando il calcolo non è possibile. */
  invalid?(): void;
}

export interface CalculatorController {
  refresh(): void;
  form: HTMLFormElement;
  root: HTMLElement;
}

const MSG = {
  required: 'Inserisci un valore.',
  nan: 'Inserisci un numero valido, ad esempio 2,5.',
  negative: 'Il valore non può essere negativo.',
  positive: 'Il valore deve essere maggiore di zero.',
  integer: 'Inserisci un numero intero.',
  min: (n: number) => `Il valore minimo è ${fmt(n, 4)}.`,
  max: (n: number) => `Il valore massimo è ${fmt(n, 4)}.`,
};

function isActive(el: HTMLElement): boolean {
  return !el.closest('[hidden]') && !(el as HTMLInputElement).disabled;
}

function validate(input: HTMLInputElement): { value: number | null; error: string | null } {
  const value = parseNumber(input.value);
  const d = input.dataset;
  if (value === null) return { value: null, error: d.optional !== undefined ? null : MSG.required };
  if (Number.isNaN(value)) return { value: null, error: MSG.nan };
  const min = d.min !== undefined && d.min !== '' ? Number(d.min) : 0;
  const max = d.max !== undefined && d.max !== '' ? Number(d.max) : null;
  if (value < 0 && min >= 0) return { value: null, error: MSG.negative };
  if (d.positive !== undefined && value <= 0) return { value: null, error: MSG.positive };
  if (value < min) return { value: null, error: MSG.min(min) };
  if (max !== null && value > max) return { value: null, error: MSG.max(max) };
  if (d.integer !== undefined && !Number.isInteger(value)) return { value: null, error: MSG.integer };
  return { value, error: null };
}

function setError(input: HTMLInputElement, message: string | null): void {
  const err = document.getElementById(`${input.id}-err`);
  input.setAttribute('aria-invalid', message ? 'true' : 'false');
  if (err) {
    err.textContent = message ?? '';
    err.hidden = !message;
  }
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

export function initCalculator<I, R>(setup: CalculatorSetup<I, R>): CalculatorController | null {
  const root = document.querySelector<HTMLElement>('[data-calculator]');
  const form = root?.querySelector<HTMLFormElement>('form');
  const resultEl = root?.querySelector<HTMLElement>('[data-result]');
  if (!root || !form || !resultEl) return null;

  const live = resultEl.querySelector<HTMLElement>('[data-live]');
  const copyStatus = resultEl.querySelector<HTMLElement>('[data-copy-status]');
  const touched = new Set<string>();
  let last: { input: I; result: R } | null = null;
  let liveTimer: number | undefined;

  const numericInputs = () => [...form.querySelectorAll<HTMLInputElement>('input[data-num]')].filter(isActive);

  function render(p: Presentation): void {
    for (const [key, text] of Object.entries(p.text)) {
      resultEl!.querySelectorAll<HTMLElement>(`[data-out="${key}"]`).forEach((el) => setResultText(el, text));
    }
    for (const [key, show] of Object.entries(p.flags ?? {})) {
      root!.querySelectorAll<HTMLElement>(`[data-show="${key}"]`).forEach((el) => (el.hidden = !show));
    }
  }

  function setStale(stale: boolean, message?: string): void {
    resultEl!.classList.toggle('is-stale', stale);
    const msg = resultEl!.querySelector<HTMLElement>('[data-stale-text]');
    if (msg && message) msg.textContent = message;
    resultEl!.querySelectorAll<HTMLButtonElement>('[data-action="copy"]').forEach((b) => (b.disabled = stale));
  }

  function announce(text: string): void {
    if (!live) return;
    window.clearTimeout(liveTimer);
    liveTimer = window.setTimeout(() => (live.textContent = text), 900);
  }

  function refresh(): void {
    const values: Values = {};
    let valid = true;
    let missingOnly = true;

    for (const input of numericInputs()) {
      const { value, error } = validate(input);
      values[input.name] = value;
      if (error) {
        valid = false;
        const isEmpty = input.value.trim() === '';
        if (!isEmpty) missingOnly = false;
        // Un campo vuoto non ancora toccato non viene segnalato come errore.
        const showError = !isEmpty || touched.has(input.name);
        if (showError) missingOnly = false;
        setError(input, showError ? error : null);
      } else {
        setError(input, null);
      }
    }
    // Pulisce gli errori dei campi nascosti
    form!.querySelectorAll<HTMLInputElement>('input[data-num]').forEach((i) => {
      if (!isActive(i)) setError(i, null);
    });

    if (!valid) {
      last = null;
      setStale(true, missingOnly ? 'Completa i campi per vedere il risultato.' : 'Correggi i campi evidenziati per vedere il risultato.');
      setup.invalid?.();
      if (!missingOnly) announce('Alcuni valori non sono validi: controlla i campi evidenziati.');
      return;
    }

    const input = setup.read(values, form!);
    const outcome = setup.compute(input);
    if (!outcome.ok) {
      last = null;
      for (const [name, message] of Object.entries(outcome.errors)) {
        const el = form!.querySelector<HTMLInputElement>(`[name="${name}"]`);
        if (el) setError(el, message);
      }
      setStale(true, Object.values(outcome.errors)[0]);
      setup.invalid?.();
      announce(Object.values(outcome.errors)[0]);
      return;
    }

    last = { input, result: outcome.result };
    render(setup.present(input, outcome.result));
    setStale(false);
    setup.after?.(input, outcome.result);
    const summary = setup.summary(input, outcome.result);
    announce(setup.announce ? setup.announce(input, outcome.result) : summary.split('\n').slice(-2).join('. '));
  }

  // Campi di testo: ricalcolo a ogni tasto. Radio, checkbox e menu: sull'evento "change",
  // dopo che gli eventuali gestori della pagina hanno aggiornato il form.
  form.addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement;
    if (!t?.matches?.('input[type="text"], textarea')) return;
    if (t.name) touched.add(t.name);
    refresh();
  });
  form.addEventListener('change', () => refresh());
  form.addEventListener('focusout', (e) => {
    const t = e.target as HTMLInputElement;
    if (t?.matches?.('input[data-num]')) {
      touched.add(t.name);
      refresh();
    }
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    refresh();
    resultEl.focus();
  });

  root.querySelector('[data-action="copy"]')?.addEventListener('click', async () => {
    if (!last) return;
    const title = root.dataset.copyTitle ?? document.title;
    const text = [
      `${title} – HomeCost`,
      '',
      setup.summary(last.input, last.result),
      '',
      `Calcolo indicativo effettuato su ${root.dataset.url ?? location.href}`,
    ].join('\n');
    const ok = await copyToClipboard(text);
    if (copyStatus) {
      copyStatus.textContent = ok ? 'Risultato copiato negli appunti.' : 'Copia non riuscita: seleziona il testo manualmente.';
      window.setTimeout(() => (copyStatus.textContent = ''), 4000);
    }
  });

  root.querySelector('[data-action="print"]')?.addEventListener('click', () => {
    const date = root.querySelector('[data-print-date]');
    if (date) date.textContent = new Intl.DateTimeFormat('it-IT', { dateStyle: 'long' }).format(new Date());
    window.print();
  });

  refresh();
  return { refresh, form, root };
}

/* Helper per leggere gli altri controlli del form */

export function radioValue(form: HTMLFormElement, name: string): string {
  return form.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`)?.value ?? '';
}

export function isChecked(form: HTMLFormElement, name: string): boolean {
  return !!form.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.checked;
}

export function selectValue(form: HTMLFormElement, name: string): string {
  return form.querySelector<HTMLSelectElement>(`select[name="${name}"]`)?.value ?? '';
}

/** Imposta il valore di un campo numerico (formattato all'italiana). */
export function setField(form: HTMLFormElement, name: string, value: number): void {
  const el = form.querySelector<HTMLInputElement>(`input[name="${name}"]`);
  if (el) el.value = String(value).replace('.', ',');
}
