import { Station } from "./types";

/**
 * Station definitions for the Cardiff–Kotara corridor.
 *
 * Stop IDs are from the TfNSW GTFS feed.
 * The parent station IDs use TfNSW's standard format.
 * Platform-level IDs follow the pattern: {parentId}{platformNum}
 *
 * These IDs will be validated against the GTFS stops.txt at runtime.
 * If the IDs don't match, the app logs a warning and attempts
 * fuzzy matching by station name.
 */

export const CARDIFF: Station = {
  id: "cardiff",
  name: "Cardiff",
  lat: -32.9432879,           // On-track position from OSM
  lng: 151.6681841,
  stopIds: ["225521"],         // Parent station stop_id
  platformIds: ["225521"],     // Platform stop_ids
};

export const KOTARA: Station = {
  id: "kotara",
  name: "Kotara",
  lat: -32.9445870,           // On-track position from OSM
  lng: 151.6884115,
  stopIds: ["225421"],         // Parent station stop_id
  platformIds: ["225421"],     // Platform stop_ids
};

export const CORRIDOR_STATIONS: Station[] = [CARDIFF, KOTARA];

/**
 * All stop IDs we need to watch for corridor movements.
 */
export function getAllStopIds(): string[] {
  return CORRIDOR_STATIONS.flatMap((s) => [...s.stopIds, ...s.platformIds]);
}

/**
 * Check if a stop_id belongs to a corridor station.
 */
export function isCorridorStop(stopId: string): boolean {
  return getAllStopIds().includes(stopId);
}

/**
 * Find which station a stop_id belongs to.
 */
export function getStationForStop(stopId: string): Station | undefined {
  return CORRIDOR_STATIONS.find(
    (s) => s.stopIds.includes(stopId) || s.platformIds.includes(stopId)
  );
}

/**
 * Determine direction based on stop sequence.
 * On the Newcastle line, increasing stop sequence towards Newcastle
 * means towards-newcastle direction.
 * Cardiff is south of Kotara (closer to Sydney).
 */
export function inferDirection(
  cardiffSequence?: number,
  kotaraSequence?: number
): "towards-newcastle" | "towards-sydney" | undefined {
  if (cardiffSequence == null || kotaraSequence == null) return undefined;
  // If Cardiff comes before Kotara in the trip, heading towards Newcastle
  return cardiffSequence < kotaraSequence
    ? "towards-newcastle"
    : "towards-sydney";
}

/**
 * Corridor bounding box for map views.
 */
export const CORRIDOR_BOUNDS = {
  north: -32.930,
  south: -32.955,
  east: 151.700,
  west: 151.655,
};

/**
 * Corridor center point.
 */
export const CORRIDOR_CENTER = {
  lat: (CORRIDOR_BOUNDS.north + CORRIDOR_BOUNDS.south) / 2,
  lng: (CORRIDOR_BOUNDS.east + CORRIDOR_BOUNDS.west) / 2,
};
