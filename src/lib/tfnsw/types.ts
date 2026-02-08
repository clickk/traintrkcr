// ─── GTFS Static Types ──────────────────────────────────────────────────────

export interface GtfsStop {
  stop_id: string;
  stop_name: string;
  stop_lat: number;
  stop_lon: number;
  parent_station?: string;
  platform_code?: string;
  location_type?: number;
}

export interface GtfsRoute {
  route_id: string;
  route_short_name: string;
  route_long_name: string;
  route_type: number;
  agency_id: string;
}

export interface GtfsTrip {
  trip_id: string;
  route_id: string;
  service_id: string;
  trip_headsign: string;
  direction_id: number;
  block_id?: string;
  shape_id?: string;
}

export interface GtfsStopTime {
  trip_id: string;
  arrival_time: string;
  departure_time: string;
  stop_id: string;
  stop_sequence: number;
  pickup_type?: number;
  drop_off_type?: number;
}

export interface GtfsCalendar {
  service_id: string;
  monday: number;
  tuesday: number;
  wednesday: number;
  thursday: number;
  friday: number;
  saturday: number;
  sunday: number;
  start_date: string;
  end_date: string;
}

export interface GtfsCalendarDate {
  service_id: string;
  date: string;
  exception_type: number;
}

export interface GtfsAgency {
  agency_id: string;
  agency_name: string;
  agency_url: string;
}

// ─── GTFS-RT Types ──────────────────────────────────────────────────────────

export interface TripUpdateEntity {
  id: string;
  tripUpdate: {
    trip: {
      tripId: string;
      routeId?: string;
      directionId?: number;
      startTime?: string;
      startDate?: string;
      scheduleRelationship?: number;
    };
    vehicle?: {
      id?: string;
      label?: string;
    };
    stopTimeUpdate?: StopTimeUpdate[];
    timestamp?: number | Long;
  };
}

export interface StopTimeUpdate {
  stopSequence?: number;
  stopId?: string;
  arrival?: {
    delay?: number;
    time?: number | Long;
    uncertainty?: number;
  };
  departure?: {
    delay?: number;
    time?: number | Long;
    uncertainty?: number;
  };
  scheduleRelationship?: number;
}

export interface VehiclePositionEntity {
  id: string;
  vehicle: {
    trip?: {
      tripId: string;
      routeId?: string;
      directionId?: number;
      startTime?: string;
      startDate?: string;
    };
    vehicle?: {
      id?: string;
      label?: string;
    };
    position?: {
      latitude: number;
      longitude: number;
      bearing?: number;
      speed?: number;
    };
    currentStopSequence?: number;
    stopId?: string;
    currentStatus?: number;
    timestamp?: number | Long;
    congestionLevel?: number;
    occupancyStatus?: number;
  };
}

// Protobuf Long type compatibility
type Long = {
  low: number;
  high: number;
  unsigned: boolean;
  toNumber: () => number;
};
