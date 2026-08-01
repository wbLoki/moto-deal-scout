/** Simple politeness delay so we don't hammer a marketplace with back-to-back requests. */
export function delay(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}
