/**
 * TfNSW Open Data API Client
 *
 * Handles authentication and requests to:
 * - GTFS Static (timetable data)
 * - GTFS-RT Trip Updates
 * - GTFS-RT Vehicle Positions
 *
 * Auth: All requests require an API key passed as
 * `Authorization: apikey {key}` header.
 */

import GtfsRealtimeBindings from "gtfs-realtime-bindings";

const TFNSW_BASE = "https://api.transport.nsw.gov.au";

// GTFS-RT endpoints
const TRIP_UPDATES_URL = `${TFNSW_BASE}/v2/gtfs/realtime/sydneytrains`;
const VEHICLE_POSITIONS_URL = `${TFNSW_BASE}/v2/gtfs/vehiclepos/sydneytrains`;

// GTFS Static is a ZIP file - we'll use a cached/parsed version
const GTFS_STATIC_URL = `${TFNSW_BASE}/v1/gtfs/schedule/sydneytrains`;

function getApiKey(): string {
  const key = process.env.TFNSW_API_KEY;
  if (!key) {
    throw new Error(
      "TFNSW_API_KEY not set. Register at https://opendata.transport.nsw.gov.au/"
    );
  }
  return key;
}

function getHeaders(): HeadersInit {
  return {
    Authorization: `apikey ${getApiKey()}`,
    Accept: "application/x-google-protobuf",
  };
}

export interface FetchResult<T> {
  data: T | null;
  error?: string;
  timestamp: string;
  status: "success" | "error";
}

/**
 * Fetch GTFS-RT Trip Updates feed.
 */
export async function fetchTripUpdates(): Promise<
  FetchResult<GtfsRealtimeBindings.transit_realtime.FeedMessage>
> {
  const timestamp = new Date().toISOString();
  try {
    const response = await fetch(TRIP_UPDATES_URL, {
      headers: getHeaders(),
      next: { revalidate: 15 }, // Cache for 15 seconds
    });

    if (!response.ok) {
      return {
        data: null,
        error: `TfNSW Trip Updates returned ${response.status}: ${response.statusText}`,
        timestamp,
        status: "error",
      };
    }

    const buffer = await response.arrayBuffer();
    const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(
      new Uint8Array(buffer)
    );

    return { data: feed, timestamp, status: "success" };
  } catch (err) {
    return {
      data: null,
      error: `Failed to fetch Trip Updates: ${err instanceof Error ? err.message : String(err)}`,
      timestamp,
      status: "error",
    };
  }
}

/**
 * Fetch GTFS-RT Vehicle Positions feed.
 */
export async function fetchVehiclePositions(): Promise<
  FetchResult<GtfsRealtimeBindings.transit_realtime.FeedMessage>
> {
  const timestamp = new Date().toISOString();
  try {
    const response = await fetch(VEHICLE_POSITIONS_URL, {
      headers: getHeaders(),
      next: { revalidate: 15 },
    });

    if (!response.ok) {
      return {
        data: null,
        error: `TfNSW Vehicle Positions returned ${response.status}: ${response.statusText}`,
        timestamp,
        status: "error",
      };
    }

    const buffer = await response.arrayBuffer();
    const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(
      new Uint8Array(buffer)
    );

    return { data: feed, timestamp, status: "success" };
  } catch (err) {
    return {
      data: null,
      error: `Failed to fetch Vehicle Positions: ${err instanceof Error ? err.message : String(err)}`,
      timestamp,
      status: "error",
    };
  }
}

/**
 * Fetch GTFS Static schedule ZIP.
 * Returns the raw ArrayBuffer for downstream parsing.
 */
export async function fetchGtfsStatic(): Promise<FetchResult<ArrayBuffer>> {
  const timestamp = new Date().toISOString();
  try {
    const response = await fetch(GTFS_STATIC_URL, {
      headers: {
        Authorization: `apikey ${getApiKey()}`,
        Accept: "application/zip",
      },
      next: { revalidate: 86400 }, // Cache for 24 hours
    });

    if (!response.ok) {
      return {
        data: null,
        error: `TfNSW GTFS Static returned ${response.status}: ${response.statusText}`,
        timestamp,
        status: "error",
      };
    }

    const buffer = await response.arrayBuffer();
    return { data: buffer, timestamp, status: "success" };
  } catch (err) {
    return {
      data: null,
      error: `Failed to fetch GTFS Static: ${err instanceof Error ? err.message : String(err)}`,
      timestamp,
      status: "error",
    };
  }
}

export { TRIP_UPDATES_URL, VEHICLE_POSITIONS_URL, GTFS_STATIC_URL };
