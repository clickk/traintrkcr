// ─── Confidence & Data Source ────────────────────────────────────────────────

export type ConfidenceLevel =
  | "confirmed-live"        // From realtime vehicle positions
  | "confirmed-updated"     // From realtime trip updates (delays, cancellations)
  | "scheduled"             // From GTFS static timetable only
  | "estimated-freight";    // From modelled or planned freight datasets

export type DataSource =
  | "tfnsw-gtfs-static"
  | "tfnsw-gtfs-rt-trip-updates"
  | "tfnsw-gtfs-rt-vehicle-positions"
  | "artc-freight"
  | "artc-freight-modelled"
  | "data-infrastructure-gov-au";

export interface ConfidenceInfo {
  level: ConfidenceLevel;
  reason: string;
  sources: DataSource[];
  lastUpdated: string; // ISO timestamp
}

// ─── Station & Stop ─────────────────────────────────────────────────────────

export interface Station {
  id: string;
  name: string;
  lat: number;
  lng: number;
  stopIds: string[];      // GTFS stop_ids (parent + platform)
  platformIds: string[];   // Platform-specific stop_ids
}

// ─── Direction ──────────────────────────────────────────────────────────────

export type Direction = "towards-newcastle" | "towards-sydney";

// ─── Service Type ───────────────────────────────────────────────────────────

export type ServiceType = "passenger" | "freight";

// ─── Movement Status ────────────────────────────────────────────────────────

export type MovementStatus =
  | "scheduled"
  | "live"
  | "delayed"
  | "cancelled"
  | "completed";

// ─── Stop Call ──────────────────────────────────────────────────────────────

export interface StopCall {
  stopId: string;
  stopName: string;
  scheduledArrival?: string;
  scheduledDeparture?: string;
  estimatedArrival?: string;
  estimatedDeparture?: string;
  platform?: string;
  stopSequence: number;
  stopsHere: boolean; // false if passing through
}

// ─── Vehicle Position ───────────────────────────────────────────────────────

export interface VehiclePosition {
  lat: number;
  lng: number;
  bearing?: number;
  speed?: number;
  timestamp: string;
  source: DataSource;
  vehicleId?: string;       // Raw dot-separated car numbers
  vehicleLabel?: string;    // e.g. "20:18 Central to Newcastle"
  carNumbers?: string[];    // Individual car numbers
  consistLength?: number;   // Number of cars (4, 6, 8, 10)
  occupancyStatus?: number; // 0=empty, 1=many seats, 2=few seats, 3=standing only
  estimatedSpeedKmh?: number; // Computed from geometry
}

// ─── Movement ───────────────────────────────────────────────────────────────

export interface Movement {
  id: string;                // Unique movement ID
  tripId?: string;           // GTFS trip_id
  runId?: string;            // Run number / train number
  routeId?: string;          // GTFS route_id
  serviceName: string;       // e.g. "T4 Newcastle & Central Coast"
  operator: string;          // e.g. "Sydney Trains", "NSW TrainLink", "Pacific National"
  serviceType: ServiceType;
  direction: Direction;
  origin: string;
  destination: string;
  consistType?: string;      // e.g. "Waratah", "Oscar", "freight consist"

  status: MovementStatus;
  stops: StopCall[];

  // Cardiff / Kotara specific
  cardiffCall?: StopCall;
  kotaraCall?: StopCall;
  passesThrough: boolean;    // true if passes corridor without stopping

  vehiclePosition?: VehiclePosition;
  confidence: ConfidenceInfo;

  // Disruption
  disruptions: string[];

  // Timing
  scheduledTime: string;     // Primary sort time (departure from first corridor station)
  estimatedTime?: string;    // If realtime is available
  delayMinutes?: number;
}

// ─── Service Alert ──────────────────────────────────────────────────────

export interface ServiceAlert {
  id: string;
  cause: string;        // e.g. "MAINTENANCE", "WEATHER", "ACCIDENT", "OTHER_CAUSE"
  effect: string;       // e.g. "NO_SERVICE", "MODIFIED_SERVICE", "SIGNIFICANT_DELAYS"
  header: string;       // Short summary
  description: string;  // Full description
  routeIds: string[];   // Affected route IDs
  tripIds: string[];    // Affected trip IDs (if specified)
  stopIds: string[];    // Affected stop IDs (if specified)
  activePeriods: { start: string; end?: string }[];
  isActive: boolean;    // Whether the alert is currently active
}

// ─── Feed Status ────────────────────────────────────────────────────────────

export interface FeedStatus {
  name: string;
  source: DataSource;
  status: "online" | "degraded" | "offline";
  lastFetched?: string;
  lastSuccessful?: string;
  error?: string;
  recordCount?: number;
}

// ─── Filters ────────────────────────────────────────────────────────────────

export type StationFilter = "cardiff" | "kotara" | "both";
export type DirectionFilter = "towards-newcastle" | "towards-sydney" | "both";
export type TypeFilter = "passenger" | "freight" | "all";
export type StatusFilter = "all" | "scheduled" | "live" | "delayed" | "cancelled" | "completed";
export type TimeWindow = "now" | "next-2h" | "today";

export interface MovementFilters {
  station: StationFilter;
  direction: DirectionFilter;
  type: TypeFilter;
  status: StatusFilter;
  timeWindow: TimeWindow;
}

// ─── API Response ───────────────────────────────────────────────────────────

export interface MovementsResponse {
  movements: Movement[];
  feeds: FeedStatus[];
  alerts: ServiceAlert[];
  filters: MovementFilters;
  timestamp: string;
  fallbackActive: boolean;
  fallbackReason?: string;
}
