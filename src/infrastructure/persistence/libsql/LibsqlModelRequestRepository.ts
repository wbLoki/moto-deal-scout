import { randomUUID } from 'node:crypto';
import type { Client } from '@libsql/client';
import type { ModelRequest, ModelRequestStatus } from '../../../domain/entities/ModelRequest.js';
import { parseVehicleType } from '../../../domain/entities/VehicleType.js';
import type {
  ModelRequestRepository,
  NewModelRequest,
} from '../../../domain/interfaces/ModelRequestRepository.js';

interface RequestRow {
  id: string;
  user_id: string;
  brand: string;
  model: string;
  note: string | null;
  status: string;
  created_at: string;
  decided_at: string | null;
  decided_by: string | null;
  requester_email?: string | null;
  vehicle_type: string | null;
}

function mapRow(row: RequestRow): ModelRequest {
  return {
    id: row.id,
    userId: row.user_id,
    brand: row.brand,
    model: row.model,
    note: row.note ?? undefined,
    status: row.status as ModelRequestStatus,
    createdAt: new Date(row.created_at),
    decidedAt: row.decided_at ? new Date(row.decided_at) : undefined,
    decidedBy: row.decided_by ?? undefined,
    vehicleType: parseVehicleType(row.vehicle_type),
    ...(row.requester_email ? { requesterEmail: row.requester_email } : {}),
  };
}

export class LibsqlModelRequestRepository implements ModelRequestRepository {
  constructor(private readonly client: Client) {}

  async create(request: NewModelRequest): Promise<ModelRequest> {
    const id = randomUUID();
    await this.client.execute({
      sql: `INSERT INTO model_requests (id, user_id, brand, model, note, status, vehicle_type)
            VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
      args: [
        id,
        request.userId,
        request.brand,
        request.model,
        request.note ?? null,
        request.vehicleType,
      ],
    });
    const created = await this.findById(id);
    if (!created) throw new Error('Model request creation failed');
    return created;
  }

  async findById(id: string): Promise<ModelRequest | null> {
    const result = await this.client.execute({
      sql: 'SELECT * FROM model_requests WHERE id = ?',
      args: [id],
    });
    const row = result.rows[0] as unknown as RequestRow | undefined;
    return row ? mapRow(row) : null;
  }

  async listByUser(userId: string): Promise<ModelRequest[]> {
    const result = await this.client.execute({
      sql: 'SELECT * FROM model_requests WHERE user_id = ? ORDER BY created_at DESC',
      args: [userId],
    });
    return (result.rows as unknown as RequestRow[]).map(mapRow);
  }

  async listPending(): Promise<ModelRequest[]> {
    const result = await this.client.execute(
      `SELECT r.*, u.email AS requester_email
         FROM model_requests r
         JOIN users u ON u.id = r.user_id
        WHERE r.status = 'pending'
        ORDER BY r.created_at DESC`,
    );
    return (result.rows as unknown as RequestRow[]).map(mapRow);
  }

  async setStatus(id: string, status: ModelRequestStatus, decidedBy: string): Promise<void> {
    await this.client.execute({
      sql: `UPDATE model_requests
               SET status = ?, decided_by = ?, decided_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
             WHERE id = ?`,
      args: [status, decidedBy, id],
    });
  }
}
