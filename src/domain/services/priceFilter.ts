/**
 * Whether a price is plausibly a real sale rather than a typo, a deposit
 * ("avance"), or a scam. Prices below `fairMinMAD * minPriceFactor` are
 * treated as implausible. Shared by the scanner (drops them before storing)
 * and the dashboard read (hides any that were stored before this existed).
 */
export function priceIsPlausible(
  priceMAD: number,
  fairMinMAD: number,
  minPriceFactor: number,
): boolean {
  return priceMAD >= fairMinMAD * minPriceFactor;
}
