/**
 * GTFS-RT Service Alerts Processor
 *
 * Fetches and processes service alerts from TfNSW, providing
 * disruption cause information for the corridor.
 */

import { fetchServiceAlerts } from "./client";
import GtfsRealtimeBindings from "gtfs-realtime-bindings";
import type { ServiceAlert, FeedStatus } from "../types";

const CAUSE_LABELS: Record<number, string> = {
  1: "UNKNOWN_CAUSE",
  2: "OTHER_CAUSE",
  3: "TECHNICAL_PROBLEM",
  4: "STRIKE",
  5: "DEMONSTRATION",
  6: "ACCIDENT",
  7: "HOLIDAY",
  8: "WEATHER",
  9: "MAINTENANCE",
  10: "CONSTRUCTION",
  11: "POLICE_ACTIVITY",
  12: "MEDICAL_EMERGENCY",
};

const EFFECT_LABELS: Record<number, string> = {
  1: "NO_SERVICE",
  2: "REDUCED_SERVICE",
  3: "SIGNIFICANT_DELAYS",
  4: "DETOUR",
  5: "ADDITIONAL_SERVICE",
  6: "MODIFIED_SERVICE",
  7: "OTHER_EFFECT",
  8: "UNKNOWN_EFFECT",
  9: "STOP_MOVED",
};

function toLong(val: unknown): number | undefined {
  if (val == null) return undefined;
  if (typeof val === "number") return val;
  if (typeof val === "object" && val !== null && "toNumber" in val) {
    return (val as { toNumber: () => number }).toNumber();
  }
  return undefined;
}

export interface ServiceAlertsResult {
  alerts: ServiceAlert[];
  feedStatus: FeedStatus;
}

/**
 * CCN route prefixes relevant to the Cardiff-Kotara corridor.
 */
const CORRIDOR_ROUTE_PREFIXES = ["CCN", "HUN", "SHL"];

export async function processServiceAlerts(): Promise<ServiceAlertsResult> {
  const result = await fetchServiceAlerts();

  const feedStatus: FeedStatus = {
    name: "GTFS-RT Service Alerts",
    source: "tfnsw-gtfs-static", // closest available source type
    status: result.status === "success" ? "online" : "offline",
    lastFetched: result.timestamp,
    lastSuccessful: result.status === "success" ? result.timestamp : undefined,
    error: result.error,
  };

  const alerts: ServiceAlert[] = [];

  if (!result.data) {
    return { alerts, feedStatus };
  }

  const now = Date.now();

  for (const entity of result.data.entity) {
    const a = entity.alert;
    if (!a) continue;

    const routeIds: string[] = [];
    const tripIds: string[] = [];
    const stopIds: string[] = [];

    for (const ie of a.informedEntity || []) {
      if (ie.routeId) routeIds.push(ie.routeId);
      if (ie.trip?.tripId) tripIds.push(ie.trip.tripId);
      if (ie.stopId) stopIds.push(ie.stopId);
    }

    // Parse active periods
    const activePeriods: { start: string; end?: string }[] = [];
    let isActive = false;

    for (const ap of a.activePeriod || []) {
      const startTs = toLong(ap.start);
      const endTs = toLong(ap.end);
      const start = startTs
        ? new Date(startTs * 1000).toISOString()
        : new Date().toISOString();
      const end = endTs ? new Date(endTs * 1000).toISOString() : undefined;
      activePeriods.push({ start, end });

      // Check if currently active
      const startMs = startTs ? startTs * 1000 : 0;
      const endMs = endTs ? endTs * 1000 : Infinity;
      if (now >= startMs && now <= endMs) {
        isActive = true;
      }
    }

    // If no active periods specified, consider it active
    if (activePeriods.length === 0) {
      isActive = true;
    }

    const header =
      a.headerText?.translation?.[0]?.text || "Service Alert";
    const description =
      a.descriptionText?.translation?.[0]?.text || "";

    const cause = CAUSE_LABELS[a.cause ?? 1] || "UNKNOWN_CAUSE";
    const effect = EFFECT_LABELS[a.effect ?? 8] || "UNKNOWN_EFFECT";

    alerts.push({
      id: entity.id,
      cause,
      effect,
      header,
      description,
      routeIds,
      tripIds,
      stopIds,
      activePeriods,
      isActive,
    });
  }

  feedStatus.recordCount = alerts.length;
  return { alerts, feedStatus };
}

/**
 * Filter alerts relevant to the Cardiff-Kotara corridor.
 * Returns all active alerts that affect CCN/HUN/SHL routes.
 */
export function getCorridorAlerts(alerts: ServiceAlert[]): ServiceAlert[] {
  return alerts.filter((a) => {
    if (!a.isActive) return false;
    // Check if any route matches corridor
    return a.routeIds.some((rid) =>
      CORRIDOR_ROUTE_PREFIXES.some((prefix) => rid.startsWith(prefix))
    );
  });
}

/**
 * Match alerts to a specific movement by tripId and routeId.
 */
export function getAlertsForMovement(
  alerts: ServiceAlert[],
  tripId?: string,
  routeId?: string
): ServiceAlert[] {
  return alerts.filter((a) => {
    if (!a.isActive) return false;
    // Direct trip match
    if (tripId && a.tripIds.includes(tripId)) return true;
    // Route match
    if (routeId && a.routeIds.some((rid) => routeId.startsWith(rid.split("_")[0]))) return true;
    return false;
  });
}
