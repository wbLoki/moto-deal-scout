/** Dynamic suffix for the WhatsApp Visit website button (`https://motosnipe.com/l/{{1}}`). */
export function listingPageButtonSuffix(sourceId: string, externalId: string): string {
  return `${encodeURIComponent(sourceId)}/${encodeURIComponent(externalId)}`;
}
