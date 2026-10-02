/**
 * Lettura in fase di build degli indici ISTAT e dei prezzi aggiornati (solo lato server).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseIstatData, type IstatData } from './calc/istat.ts';
import { categoryRevaluation, describeCategories, parsePriceIndices, revalue, type PriceIndices, type Revaluation } from './prices.ts';
import { BASE_PRICES, PRICE_BASE_MONTH, PRICE_CATEGORIES, type BasePrices, type PriceCategory } from '../config/prices.ts';

let cached: IstatData | null = null;
let cachedIndices: PriceIndices | null = null;

export function loadIstatData(): IstatData {
  cached ??= parseIstatData(JSON.parse(readFileSync(join(process.cwd(), 'public/data/istat-foi.json'), 'utf8')));
  return cached;
}

export function loadPriceIndices(): PriceIndices {
  const file = join(process.cwd(), 'public/data/istat-prezzi.json');
  cachedIndices ??= parsePriceIndices(existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {});
  return cachedIndices;
}

/**
 * Prezzi base rivalutati con l'indice ISTAT della loro voce di spesa.
 * `categories`: voci da citare nella nota (quelle usate dalla pagina).
 */
export function currentPrices(categories: PriceCategory[]): { prices: BasePrices; note: string } {
  const revs = {} as Record<PriceCategory, Revaluation>;
  for (const cat of new Set(Object.values(PRICE_CATEGORIES))) {
    revs[cat] = categoryRevaluation(cat, loadPriceIndices(), loadIstatData(), PRICE_BASE_MONTH);
  }
  const prices = Object.fromEntries(
    (Object.keys(BASE_PRICES) as (keyof BasePrices)[]).map((k) => [
      k,
      revalue(BASE_PRICES[k], revs[PRICE_CATEGORIES[k]].factor, k === 'energiaKwh' ? 4 : 2),
    ]),
  ) as BasePrices;
  return { prices, note: describeCategories(categories.map((c) => [c, revs[c]])) };
}
