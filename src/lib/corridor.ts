/**
 * Corridor Movement Aggregator
 *
 * Combines passenger (GTFS static + realtime) and freight data
 * into a unified movement list for the Cardiff–Kotara corridor.
 */

import { getScheduledMovements } from "./tfnsw/gtfs-static";
import {
  processTripUpdates,
  processVehiclePositions,
  mergeRealtimeData,
} from "./tfnsw/gtfs-realtime";
import { getFreightMovements } from "./freight/artc-client";
import type {
  Movement,
  MovementFilters,
  MovementsResponse,
  FeedStatus,
} from "./types";
import { addHours, endOfDay, startOfDay } from "date-fns";

// ─── Time Window Calculation ────────────────────────────────────────────────

function getTimeWindow(
  timeWindow: MovementFilters["timeWindow"],
  now: Date
): { from: Date; to: Date } {
  switch (timeWindow) {
    case "now":
      return {
        from: new Date(now.getTime() - 15 * 60000), // 15 min ago
        to: addHours(now, 1),
      };
    case "next-2h":
      return {
        from: new Date(now.getTime() - 5 * 60000), // 5 min ago
        to: addHours(now, 2),
      };
    case "today":
      return {
        from: startOfDay(now),
        to: endOfDay(now),
      };
  }
}

// ─── Filter Movements ───────────────────────────────────────────────────────

function applyFilters(
  movements: Movement[],
  filters: MovementFilters
): Movement[] {
  return movements.filter((m) => {
    // Station filter
    if (filters.station === "cardiff" && !m.cardiffCall) return false;
    if (filters.station === "kotara" && !m.kotaraCall) return false;

    // Direction filter
    if (filters.direction !== "both" && m.direction !== filters.direction)
      return false;

    // Type filter
    if (filters.type === "passenger" && m.serviceType !== "passenger")
      return false;
    if (filters.type === "freight" && m.serviceType !== "freight")
      return false;

    // Status filter
    if (filters.status !== "all" && m.status !== filters.status) return false;

    return true;
  });
}

// ─── Sort Movements ─────────────────────────────────────────────────────────

function sortMovements(movements: Movement[]): Movement[] {
  return [...movements].sort((a, b) => {
    const timeA = new Date(a.estimatedTime || a.scheduledTime).getTime();
    const timeB = new Date(b.estimatedTime || b.scheduledTime).getTime();
    return timeA - timeB;
  });
}

// ─── Determine Completed Status ─────────────────────────────────────────────

function markCompletedMovements(movements: Movement[], now: Date): Movement[] {
  return movements.map((m) => {
    if (m.status === "cancelled") return m;

    // Get the latest departure time from corridor stations
    const lastDeparture = [m.cardiffCall, m.kotaraCall]
      .filter(Boolean)
      .map((c) => c!.estimatedDeparture || c!.scheduledDeparture)
      .filter(Boolean)
      .map((t) => new Date(t!).getTime())
      .sort((a, b) => b - a)[0];

    if (lastDeparture && lastDeparture < now.getTime() - 5 * 60000) {
      // More than 5 minutes past the last corridor departure
      if (m.status !== "live") {
        return { ...m, status: "completed" as const };
      }
    }

    return m;
  });
}

// ─── Main Aggregation ───────────────────────────────────────────────────────

export async function getCorridorMovements(
  filters: MovementFilters
): Promise<MovementsResponse> {
  const now = new Date();
  const { from, to } = getTimeWindow(filters.timeWindow, now);
  const feeds: FeedStatus[] = [];
  let fallbackActive = false;
  let fallbackReason: string | undefined;

  // 1. Get scheduled passenger movements
  const scheduledMovements = getScheduledMovements(from, to);
  feeds.push({
    name: "GTFS Static Schedule",
    source: "tfnsw-gtfs-static",
    status: "online",
    lastFetched: now.toISOString(),
    lastSuccessful: now.toISOString(),
    recordCount: scheduledMovements.length,
  });

  // 2. Try to get realtime updates
  let movements: Movement[];
  try {
    const [tripUpdatesResult, vehiclePositionsResult] = await Promise.all([
      processTripUpdates(),
      processVehiclePositions(),
    ]);

    feeds.push(tripUpdatesResult.feedStatus, vehiclePositionsResult.feedStatus);

    // 3. Merge realtime into scheduled
    movements = mergeRealtimeData(
      scheduledMovements,
      tripUpdatesResult.updates,
      vehiclePositionsResult.positions
    );

    // Check if realtime was actually available
    if (
      tripUpdatesResult.feedStatus.status === "offline" &&
      vehiclePositionsResult.feedStatus.status === "offline"
    ) {
      fallbackActive = true;
      fallbackReason =
        "Realtime feeds are unavailable. Showing scheduled times only. " +
        (tripUpdatesResult.feedStatus.error || "") +
        " " +
        (vehiclePositionsResult.feedStatus.error || "");
    }
  } catch (err) {
    // Realtime failed entirely — fall back to static
    movements = scheduledMovements;
    fallbackActive = true;
    fallbackReason = `Realtime data unavailable: ${err instanceof Error ? err.message : String(err)}. Showing scheduled times only.`;
    feeds.push({
      name: "GTFS-RT Trip Updates",
      source: "tfnsw-gtfs-rt-trip-updates",
      status: "offline",
      lastFetched: now.toISOString(),
      error: fallbackReason,
    });
    feeds.push({
      name: "GTFS-RT Vehicle Positions",
      source: "tfnsw-gtfs-rt-vehicle-positions",
      status: "offline",
      lastFetched: now.toISOString(),
      error: fallbackReason,
    });
  }

  // 4. Get freight movements
  if (filters.type !== "passenger") {
    try {
      const freightResult = await getFreightMovements(now);

      // Filter freight by time window
      const freightInWindow = freightResult.movements.filter((m) => {
        const t = new Date(m.scheduledTime);
        return t >= from && t <= to;
      });

      movements = [...movements, ...freightInWindow];
      feeds.push(freightResult.feedStatus);
    } catch (err) {
      feeds.push({
        name: "Freight Data",
        source: "artc-freight-modelled",
        status: "offline",
        lastFetched: now.toISOString(),
        error: `Freight data unavailable: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  // 5. Mark completed movements
  movements = markCompletedMovements(movements, now);

  // 6. Apply filters
  movements = applyFilters(movements, filters);

  // 7. Sort
  movements = sortMovements(movements);

  return {
    movements,
    feeds,
    filters,
    timestamp: now.toISOString(),
    fallbackActive,
    fallbackReason,
  };
}
