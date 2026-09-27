/**
 * PREZZI BASE per le stime di spesa dei calcolatori.
 *
 * Sono prezzi medi INDICATIVI (fascia media, IVA inclusa) riferiti al mese PRICE_BASE_MONTH:
 * verificali e correggili con i prezzi dei tuoi fornitori o partner.
 *
 * Non vanno aggiornati a mano: a ogni build il sito li rivaluta con la variazione dell'indice
 * ISTAT FOI (public/data/istat-foi.json) tra PRICE_BASE_MONTH e l'ultimo mese disponibile.
 * Il file degli indici viene aggiornato ogni mese in automatico da GitHub Actions
 * (.github/workflows/istat-update.yml).
 *
 * Se modifichi i prezzi, aggiorna anche PRICE_BASE_MONTH al mese a cui si riferiscono.
 */

/** Mese a cui si riferiscono i prezzi qui sotto (AAAA-MM). */
export const PRICE_BASE_MONTH = '2026-09';

export const BASE_PRICES = {
  /** Energia elettrica, €/kWh tutto compreso (materia prima, trasporto, oneri, imposte). */
  energiaKwh: 0.28,
  /** Idropittura lavabile per interni, € per barattolo. */
  pittura: { 2.5: 20, 5: 32, 10: 55 },
  /** Piastrelle in gres porcellanato, €/m². */
  piastrelleM2: 25,
  /** Cartongesso. */
  cartongesso: {
    /** Lastra standard 12,5 mm, € per lastra. */
    lastra: 9,
    /** Guida a U, € per barra da 3 m. */
    guida: 4,
    /** Montante a C, € per barra da 3 m. */
    montante: 5,
    /** Viti per cartongesso, € per confezione da 100. */
    viti100: 4,
    /** Tassello per le guide, € cadauno. */
    tassello: 0.15,
  },
  /** Parquet prefinito, €/m². */
  parquetM2: 35,
  /** Battiscopa in legno, €/m. */
  battiscopaM: 4,
};

export type BasePrices = typeof BASE_PRICES;
