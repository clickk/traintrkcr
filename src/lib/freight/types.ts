/**
 * Freight Movement Types
 *
 * Types for freight train movements from ARTC and
 * data.infrastructure.gov.au datasets.
 */

export interface FreightMovement {
  trainId: string;
  operator: string;        // e.g. "Pacific National", "Aurizon", "QUBE"
  origin: string;
  destination: string;
  commodityType?: string;  // e.g. "Intermodal", "Coal", "Grain"
  consistType: string;     // e.g. "Locomotive + wagons"
  scheduledDeparture?: string;
  scheduledArrival?: string;
  estimatedCardiffPass?: string;
  estimatedKotaraPass?: string;
  direction: "towards-newcastle" | "towards-sydney";
  source: "artc-freight" | "artc-freight-modelled" | "data-infrastructure-gov-au";
  lastUpdated: string;
}

export interface ArtcTrainMovement {
  train_id: string;
  operator: string;
  origin_location: string;
  destination_location: string;
  departure_datetime: string;
  arrival_datetime: string;
  commodity?: string;
  path_nodes?: string[];
}

export interface FreightDataset {
  source: string;
  description: string;
  lastUpdated: string;
  records: FreightMovement[];
  limitations: string[];
}
