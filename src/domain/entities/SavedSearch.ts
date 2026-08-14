import type { FuelType, GearboxType, VehicleType } from './VehicleType.js';

/**
 * A named, persisted filter snapshot. Empty arrays mean "any". Optional
 * `modelIds` empty means any tracked model of this vehicle type.
 */
export interface SavedSearch {
  readonly id: string;
  readonly userId: string;
  readonly name: string;
  readonly vehicleType: VehicleType;
  readonly budgetMin: number;
  readonly budgetMax: number;
  readonly yearMin: number;
  readonly yearMax: number;
  /** `0` / undefined = no mileage cap. */
  readonly mileageMax: number;
  readonly brands: readonly string[];
  readonly cities: readonly string[];
  readonly fuelTypes: readonly FuelType[];
  readonly gearboxes: readonly GearboxType[];
  readonly modelIds: readonly string[];
}

export type NewSavedSearch = Omit<SavedSearch, 'id' | 'userId'>;
