/**
 * GTFS-RT Data Adapter
 *
 * Processes realtime Trip Updates and Vehicle Positions from TfNSW
 * and merges them with scheduled movement data.
 */

import { fetchTripUpdates, fetchVehiclePositions } from "./client";
import { getAllStopIds, getStationForStop, CARDIFF, KOTARA } from "../stations";
import type {
  Movement,
  VehiclePosition,
  FeedStatus,
  ConfidenceInfo,
  StopCall,
} from "../types";

// ─── Trip Updates Processing ────────────────────────────────────────────────

interface TripUpdateResult {
  updates: Map<string, TripUpdateData>;
  feedStatus: FeedStatus;
}

interface TripUpdateData {
  tripId: string;
  routeId?: string;
  delay?: number; // seconds
  cancelled: boolean;
  stopTimeUpdates: Map<
    string,
    {
      arrivalDelay?: number;
      departureDelay?: number;
      arrivalTime?: number;
      departureTime?: number;
    }
  >;
  timestamp?: string;
}

function toLong(val: unknown): number | undefined {
  if (val == null) return undefined;
  if (typeof val === "number") return val;
  if (typeof val === "object" && val !== null && "toNumber" in val) {
    return (val as { toNumber: () => number }).toNumber();
  }
  return undefined;
}

export async function processTripUpdates(): Promise<TripUpdateResult> {
  const result = await fetchTripUpdates();
  const corridorStopIds = new Set(getAllStopIds());

  const feedStatus: FeedStatus = {
    name: "GTFS-RT Trip Updates",
    source: "tfnsw-gtfs-rt-trip-updates",
    status: result.status === "success" ? "online" : "offline",
    lastFetched: result.timestamp,
    lastSuccessful: result.status === "success" ? result.timestamp : undefined,
    error: result.error,
  };

  const updates = new Map<string, TripUpdateData>();

  if (!result.data) {
    return { updates, feedStatus };
  }

  for (const entity of result.data.entity) {
    const tu = entity.tripUpdate;
    if (!tu?.trip?.tripId) continue;

    // Check if this trip stops at any corridor station
    const stopUpdates = tu.stopTimeUpdate || [];
    const relevantStopUpdates = stopUpdates.filter(
      (stu) => stu.stopId && corridorStopIds.has(stu.stopId)
    );

    // Only include trips that touch corridor stations
    if (relevantStopUpdates.length === 0 && stopUpdates.length > 0) {
      // Still check: trip might pass through even if no stop update for our stops
      continue;
    }

    const stopTimeUpdateMap = new Map<
      string,
      {
        arrivalDelay?: number;
        departureDelay?: number;
        arrivalTime?: number;
        departureTime?: number;
      }
    >();

    for (const stu of stopUpdates) {
      if (!stu.stopId) continue;
      stopTimeUpdateMap.set(stu.stopId, {
        arrivalDelay: stu.arrival?.delay ?? undefined,
        departureDelay: stu.departure?.delay ?? undefined,
        arrivalTime: toLong(stu.arrival?.time),
        departureTime: toLong(stu.departure?.time),
      });
    }

    const cancelled =
      tu.trip.scheduleRelationship === 3; // CANCELED

    const timestamp = toLong(tu.timestamp);

    updates.set(tu.trip.tripId, {
      tripId: tu.trip.tripId,
      routeId: tu.trip.routeId ?? undefined,
      cancelled,
      stopTimeUpdates: stopTimeUpdateMap,
      timestamp: timestamp
        ? new Date(timestamp * 1000).toISOString()
        : undefined,
    });
  }

  feedStatus.recordCount = updates.size;
  return { updates, feedStatus };
}

// ─── Vehicle Positions Processing ───────────────────────────────────────────

interface VehiclePositionResult {
  positions: Map<string, VehiclePosition>;
  feedStatus: FeedStatus;
}

export async function processVehiclePositions(): Promise<VehiclePositionResult> {
  const result = await fetchVehiclePositions();

  const feedStatus: FeedStatus = {
    name: "GTFS-RT Vehicle Positions",
    source: "tfnsw-gtfs-rt-vehicle-positions",
    status: result.status === "success" ? "online" : "offline",
    lastFetched: result.timestamp,
    lastSuccessful: result.status === "success" ? result.timestamp : undefined,
    error: result.error,
  };

  const positions = new Map<string, VehiclePosition>();

  if (!result.data) {
    return { positions, feedStatus };
  }

  for (const entity of result.data.entity) {
    const vp = entity.vehicle;
    if (!vp?.trip?.tripId || !vp.position) continue;

    const timestamp = toLong(vp.timestamp);

    // Extract vehicle descriptor data
    const rawVehicleId = vp.vehicle?.id ?? undefined;
    const vehicleLabel = vp.vehicle?.label ?? undefined;
    const carNumbers = rawVehicleId ? rawVehicleId.split(".") : undefined;
    const consistLength = carNumbers ? carNumbers.length : undefined;

    positions.set(vp.trip.tripId, {
      lat: vp.position.latitude,
      lng: vp.position.longitude,
      bearing: vp.position.bearing ?? undefined,
      speed: vp.position.speed ?? undefined,
      timestamp: timestamp
        ? new Date(timestamp * 1000).toISOString()
        : new Date().toISOString(),
      source: "tfnsw-gtfs-rt-vehicle-positions",
      vehicleId: rawVehicleId,
      vehicleLabel,
      carNumbers,
      consistLength,
      occupancyStatus: vp.occupancyStatus ?? undefined,
    });
  }

  feedStatus.recordCount = positions.size;
  return { positions, feedStatus };
}

// ─── Merge Realtime into Scheduled ──────────────────────────────────────────

export function mergeRealtimeData(
  movements: Movement[],
  tripUpdates: Map<string, TripUpdateData>,
  vehiclePositions: Map<string, VehiclePosition>
): Movement[] {
  return movements.map((movement) => {
    const updated = { ...movement };

    // Match by trip_id
    const tripUpdate = movement.tripId
      ? tripUpdates.get(movement.tripId)
      : undefined;

    if (tripUpdate) {
      // Apply trip update
      if (tripUpdate.cancelled) {
        updated.status = "cancelled";
        updated.confidence = {
          level: "confirmed-updated",
          reason: "Trip cancelled per GTFS-RT trip update",
          sources: ["tfnsw-gtfs-rt-trip-updates"],
          lastUpdated: tripUpdate.timestamp || new Date().toISOString(),
        };
        updated.disruptions = [
          ...updated.disruptions,
          "Service cancelled",
        ];
      } else {
        // Apply delay information
        const updateStopCall = (
          call: StopCall | undefined,
        ): StopCall | undefined => {
          if (!call) return call;
          const stopUpdate = tripUpdate.stopTimeUpdates.get(call.stopId);
          if (!stopUpdate) return call;

          const updatedCall = { ...call };

          if (stopUpdate.arrivalTime) {
            updatedCall.estimatedArrival = new Date(
              stopUpdate.arrivalTime * 1000
            ).toISOString();
          } else if (
            stopUpdate.arrivalDelay &&
            call.scheduledArrival
          ) {
            updatedCall.estimatedArrival = new Date(
              new Date(call.scheduledArrival).getTime() +
                stopUpdate.arrivalDelay * 1000
            ).toISOString();
          }

          if (stopUpdate.departureTime) {
            updatedCall.estimatedDeparture = new Date(
              stopUpdate.departureTime * 1000
            ).toISOString();
          } else if (
            stopUpdate.departureDelay &&
            call.scheduledDeparture
          ) {
            updatedCall.estimatedDeparture = new Date(
              new Date(call.scheduledDeparture).getTime() +
                stopUpdate.departureDelay * 1000
            ).toISOString();
          }

          return updatedCall;
        };

        updated.cardiffCall = updateStopCall(updated.cardiffCall);
        updated.kotaraCall = updateStopCall(updated.kotaraCall);
        updated.stops = updated.stops.map(
          (s) => updateStopCall(s) || s
        );

        // Calculate overall delay
        const primaryCall =
          updated.direction === "towards-newcastle"
            ? updated.cardiffCall
            : updated.kotaraCall;

        if (primaryCall?.estimatedDeparture && primaryCall?.scheduledDeparture) {
          const delay =
            (new Date(primaryCall.estimatedDeparture).getTime() -
              new Date(primaryCall.scheduledDeparture).getTime()) /
            60000;
          updated.delayMinutes = Math.round(delay);
          updated.estimatedTime = primaryCall.estimatedDeparture;

          if (delay > 2) {
            updated.status = "delayed";
          } else {
            updated.status = "live";
          }
        } else {
          updated.status = "live";
        }

        updated.confidence = {
          level: "confirmed-updated",
          reason: "Times updated from GTFS-RT trip update feed",
          sources: ["tfnsw-gtfs-static", "tfnsw-gtfs-rt-trip-updates"],
          lastUpdated: tripUpdate.timestamp || new Date().toISOString(),
        };
      }
    }

    // Apply vehicle position
    const position = movement.tripId
      ? vehiclePositions.get(movement.tripId)
      : undefined;

    if (position) {
      updated.vehiclePosition = position;
      updated.confidence = {
        level: "confirmed-live",
        reason: "Live vehicle position confirmed from GTFS-RT",
        sources: [
          ...updated.confidence.sources.filter(
            (s) => s !== "tfnsw-gtfs-rt-vehicle-positions"
          ),
          "tfnsw-gtfs-rt-vehicle-positions",
        ],
        lastUpdated: position.timestamp,
      };
      if (updated.status === "scheduled") {
        updated.status = "live";
      }
    }

    return updated;
  });
}
