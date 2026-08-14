import type { VehicleType } from './VehicleType.js';

export type ModelRequestStatus = 'pending' | 'approved' | 'rejected';

/** A user-submitted suggestion for a model the scanner should track. */
export interface ModelRequest {
  readonly id: string;
  readonly userId: string;
  readonly brand: string;
  readonly model: string;
  readonly note: string | undefined;
  readonly status: ModelRequestStatus;
  readonly createdAt: Date;
  readonly decidedAt: Date | undefined;
  readonly decidedBy: string | undefined;
  readonly vehicleType: VehicleType;
  /** Denormalized submitter email, populated when the admin lists the queue. */
  readonly requesterEmail?: string;
}
