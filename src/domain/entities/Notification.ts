/** In-app (and emailed) alert delivered to a single user. */
export type NotificationType = 'new_deal' | 'price_drop';

/** A notification about to be created; the store assigns id/created_at. */
export interface NewNotification {
  readonly userId: string;
  readonly type: NotificationType;
  readonly sourceId: string;
  readonly externalId: string;
  readonly modelId: string | null;
  readonly priceMAD: number | null;
  /** The prior price on a `price_drop`; null otherwise. */
  readonly oldPriceMAD: number | null;
  readonly url: string;
  readonly imageUrl: string | null;
  /** Human-readable one-liner, e.g. "Yamaha MT-07 — 78 000 MAD". */
  readonly title: string;
}

/** A stored notification as read back from the database. */
export interface StoredNotification extends NewNotification {
  readonly id: string;
  readonly createdAt: string;
  readonly readAt: string | null;
  readonly emailedAt: string | null;
}
