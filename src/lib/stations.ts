import { Station } from "./types";

/**
 * Station definitions for the Cardiff–Kotara corridor.
 *
 * Coordinates are on-track positions from OpenStreetMap rail geometry,
 * matched to TfNSW GTFS stop_ids.
 */

export const CARDIFF: Station = {
  id: "cardiff",
  name: "Cardiff",
  lat: -32.9418238759,
  lng: 151.662980082,
  stopIds: ["228520", "2285361", "2285362"],
  platformIds: ["2285361", "2285362"],
};

export const KOTARA: Station = {
  id: "kotara",
  name: "Kotara",
  lat: -32.9413962736,
  lng: 151.69849332,
  stopIds: ["228910", "2289341", "2289342"],
  platformIds: ["2289341", "2289342"],
};

export const CORRIDOR_STATIONS: Station[] = [CARDIFF, KOTARA];

/**
 * User watch point — 32°56'38.6"S 151°41'30.9"E
 * Between Tickhole Tunnel and Kotara station on the track.
 */
export const WATCH_POINT = {
  name: "My Location",
  lat: -32.9440556,
  lng: 151.6919167,
};

export function getAllStopIds(): string[] {
  return CORRIDOR_STATIONS.flatMap((s) => [...s.stopIds, ...s.platformIds]);
}

export function isCorridorStop(stopId: string): boolean {
  return getAllStopIds().includes(stopId);
}

export function getStationForStop(stopId: string): Station | undefined {
  return CORRIDOR_STATIONS.find(
    (s) => s.stopIds.includes(stopId) || s.platformIds.includes(stopId)
  );
}

export function inferDirection(
  cardiffSequence?: number,
  kotaraSequence?: number
): "towards-newcastle" | "towards-sydney" | undefined {
  if (cardiffSequence == null || kotaraSequence == null) return undefined;
  return cardiffSequence < kotaraSequence
    ? "towards-newcastle"
    : "towards-sydney";
}

export const CORRIDOR_BOUNDS = {
  north: -32.920,
  south: -32.962,
  east: 151.738,
  west: 151.605,
};

export const CORRIDOR_CENTER = {
  lat: (CARDIFF.lat + KOTARA.lat) / 2,
  lng: (CARDIFF.lng + KOTARA.lng) / 2,
};
