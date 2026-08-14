'use server';

import type { ModelYearMarket } from '../src/domain/interfaces/ListingRepository.js';
import { getModelYearMarket } from '../src/readModel.js';

export async function fetchModelYearMarketAction(input: {
  readonly modelId: string;
  readonly year: number | null;
  readonly vehicleType: 'motorcycle' | 'car';
  readonly sourceId: string;
  readonly externalId: string;
  readonly listingPrice: number;
}): Promise<{ ok: boolean; market: ModelYearMarket | null }> {
  try {
    const market = await getModelYearMarket(input);
    return { ok: true, market };
  } catch {
    return { ok: false, market: null };
  }
}
