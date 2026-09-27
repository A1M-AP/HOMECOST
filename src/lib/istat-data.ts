/**
 * Lettura in fase di build degli indici ISTAT e dei prezzi aggiornati (solo lato server).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseIstatData, type IstatData } from './calc/istat.ts';
import { revaluation, revalue, describeRevaluation } from './prices.ts';
import { BASE_PRICES, PRICE_BASE_MONTH, type BasePrices } from '../config/prices.ts';

let cached: IstatData | null = null;

export function loadIstatData(): IstatData {
  cached ??= parseIstatData(JSON.parse(readFileSync(join(process.cwd(), 'public/data/istat-foi.json'), 'utf8')));
  return cached;
}

/** Prezzi base rivalutati con l'ultimo indice ISTAT disponibile. */
export function currentPrices(): { prices: BasePrices; note: string } {
  const r = revaluation(loadIstatData(), PRICE_BASE_MONTH);
  return {
    prices: { ...revalue(BASE_PRICES, r.factor), energiaKwh: revalue(BASE_PRICES.energiaKwh, r.factor, 4) },
    note: describeRevaluation(r),
  };
}
