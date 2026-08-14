import type { ModelRequest, ModelRequestStatus } from '../entities/ModelRequest.js';
import type { VehicleType } from '../entities/VehicleType.js';

export interface NewModelRequest {
  readonly userId: string;
  readonly brand: string;
  readonly model: string;
  readonly note: string | undefined;
  readonly vehicleType: VehicleType;
}

/** User-submitted model suggestions and their admin approval state. */
export interface ModelRequestRepository {
  create(request: NewModelRequest): Promise<ModelRequest>;
  findById(id: string): Promise<ModelRequest | null>;
  /** Requests submitted by one user, newest first. */
  listByUser(userId: string): Promise<ModelRequest[]>;
  /** Pending requests across all users (with requester email), newest first. */
  listPending(): Promise<ModelRequest[]>;
  /** Records an approve/reject decision. */
  setStatus(id: string, status: ModelRequestStatus, decidedBy: string): Promise<void>;
}
