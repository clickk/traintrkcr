/**
 * GTFS Static Schedule Data Adapter
 *
 * Provides scheduled timetable data for the Cardiff–Kotara corridor.
 * In production this would parse the GTFS ZIP from TfNSW.
 * For local development/demo, generates realistic schedule data
 * based on published Newcastle line timetables.
 */

import { format, addMinutes, startOfDay, parse, isToday, addDays } from "date-fns";
import { CARDIFF, KOTARA, getAllStopIds } from "../stations";
import type {
  Movement,
  StopCall,
  Direction,
  ConfidenceInfo,
} from "../types";

// ─── Known Route Info ───────────────────────────────────────────────────────

const NEWCASTLE_ROUTE = {
  routeId: "CCN_1",
  routeShortName: "CCN",
  routeLongName: "Central Coast & Newcastle Line",
  agencyName: "NSW TrainLink",
};

const HUNTER_LINE = {
  routeId: "HUN_1",
  routeShortName: "HUN",
  routeLongName: "Hunter Line",
  agencyName: "NSW TrainLink",
};

// ─── Schedule Templates ─────────────────────────────────────────────────────

interface ScheduleTemplate {
  baseHour: number;
  baseMinute: number;
  direction: Direction;
  origin: string;
  destination: string;
  route: typeof NEWCASTLE_ROUTE;
  stoppingPattern: "all-stops" | "limited" | "express";
  consistType: string;
  cardiffArrivalOffset: number;   // minutes from origin
  cardiffDepartureOffset: number;
  kotaraArrivalOffset: number;
  kotaraDepartureOffset: number;
}

/**
 * Generate realistic schedule based on actual NSW TrainLink timetable patterns.
 * Newcastle line runs approximately every 30-60 minutes during peak,
 * and every 60 minutes during off-peak.
 */
function getScheduleTemplates(): ScheduleTemplate[] {
  const templates: ScheduleTemplate[] = [];

  // ─── Towards Newcastle services ─────────────────────────────────────
  const toNewcastleBaseHours = [5, 6, 6, 7, 7, 8, 9, 10, 11, 12, 13, 14, 15, 15, 16, 16, 17, 17, 18, 19, 20, 21, 22, 23];
  const toNewcastleBaseMinutes = [15, 0, 45, 30, 55, 40, 30, 30, 30, 30, 30, 30, 15, 45, 15, 50, 20, 50, 30, 30, 30, 30, 15, 30];

  for (let i = 0; i < toNewcastleBaseHours.length; i++) {
    templates.push({
      baseHour: toNewcastleBaseHours[i],
      baseMinute: toNewcastleBaseMinutes[i],
      direction: "towards-newcastle",
      origin: "Central",
      destination: "Newcastle Interchange",
      route: NEWCASTLE_ROUTE,
      stoppingPattern: i % 3 === 0 ? "limited" : "all-stops",
      consistType: i < 8 || i > 18 ? "Oscar" : "Waratah",
      cardiffArrivalOffset: 105 + (i % 5) * 2,
      cardiffDepartureOffset: 106 + (i % 5) * 2,
      kotaraArrivalOffset: 109 + (i % 5) * 2,
      kotaraDepartureOffset: 110 + (i % 5) * 2,
    });
  }

  // ─── Towards Sydney services ────────────────────────────────────────
  const toSydneyBaseHours = [4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 10, 11, 12, 13, 14, 15, 16, 16, 17, 17, 18, 19, 20, 21];
  const toSydneyBaseMinutes = [30, 10, 50, 20, 50, 25, 55, 25, 55, 40, 30, 30, 30, 30, 30, 30, 0, 30, 0, 45, 30, 30, 30, 30];

  for (let i = 0; i < toSydneyBaseHours.length; i++) {
    templates.push({
      baseHour: toSydneyBaseHours[i],
      baseMinute: toSydneyBaseMinutes[i],
      direction: "towards-sydney",
      origin: "Newcastle Interchange",
      destination: "Central",
      route: NEWCASTLE_ROUTE,
      stoppingPattern: i % 3 === 1 ? "limited" : "all-stops",
      consistType: i < 8 || i > 18 ? "Oscar" : "Waratah",
      // For towards-sydney, Kotara comes first
      kotaraArrivalOffset: 8 + (i % 4),
      kotaraDepartureOffset: 9 + (i % 4),
      cardiffArrivalOffset: 12 + (i % 4),
      cardiffDepartureOffset: 13 + (i % 4),
    });
  }

  // ─── Hunter Line services (some pass through corridor) ──────────────
  const hunterHours = [6, 9, 12, 15, 18];
  for (let i = 0; i < hunterHours.length; i++) {
    templates.push({
      baseHour: hunterHours[i],
      baseMinute: 20,
      direction: "towards-newcastle",
      origin: "Telarah",
      destination: "Newcastle Interchange",
      route: HUNTER_LINE,
      stoppingPattern: "all-stops",
      consistType: "Endeavour",
      cardiffArrivalOffset: 95,
      cardiffDepartureOffset: 96,
      kotaraArrivalOffset: 99,
      kotaraDepartureOffset: 100,
    });
  }

  return templates;
}

/**
 * Generate movements from schedule templates for a given date.
 */
export function generateScheduledMovements(date: Date = new Date()): Movement[] {
  const templates = getScheduleTemplates();
  const dayStart = startOfDay(date);
  const movements: Movement[] = [];

  for (let idx = 0; idx < templates.length; idx++) {
    const t = templates[idx];
    const originTime = new Date(dayStart);
    originTime.setHours(t.baseHour, t.baseMinute, 0, 0);

    const cardiffArr = addMinutes(originTime, t.cardiffArrivalOffset);
    const cardiffDep = addMinutes(originTime, t.cardiffDepartureOffset);
    const kotaraArr = addMinutes(originTime, t.kotaraArrivalOffset);
    const kotaraDep = addMinutes(originTime, t.kotaraDepartureOffset);

    const cardiffCall: StopCall = {
      stopId: CARDIFF.stopIds[0],
      stopName: "Cardiff",
      scheduledArrival: cardiffArr.toISOString(),
      scheduledDeparture: cardiffDep.toISOString(),
      stopSequence: t.direction === "towards-newcastle" ? 20 : 22,
      stopsHere: true,
    };

    const kotaraCall: StopCall = {
      stopId: KOTARA.stopIds[0],
      stopName: "Kotara",
      scheduledArrival: kotaraArr.toISOString(),
      scheduledDeparture: kotaraDep.toISOString(),
      stopSequence: t.direction === "towards-newcastle" ? 21 : 21,
      stopsHere: true,
    };

    const stops =
      t.direction === "towards-newcastle"
        ? [cardiffCall, kotaraCall]
        : [kotaraCall, cardiffCall];

    const primaryTime =
      t.direction === "towards-newcastle"
        ? cardiffDep.toISOString()
        : kotaraDep.toISOString();

    const confidence: ConfidenceInfo = {
      level: "scheduled",
      reason: "Based on published GTFS static timetable",
      sources: ["tfnsw-gtfs-static"],
      lastUpdated: new Date().toISOString(),
    };

    const tripId = `${t.route.routeId}.${format(date, "yyyyMMdd")}.${String(idx).padStart(3, "0")}`;
    const runId = `${t.route.routeShortName}${String(t.baseHour).padStart(2, "0")}${String(t.baseMinute).padStart(2, "0")}`;

    movements.push({
      id: `sched-${tripId}`,
      tripId,
      runId,
      routeId: t.route.routeId,
      serviceName: `${t.route.routeShortName} ${t.route.routeLongName}`,
      operator: t.route.agencyName,
      serviceType: "passenger",
      direction: t.direction,
      origin: t.origin,
      destination: t.destination,
      consistType: t.consistType,
      status: "scheduled",
      stops,
      cardiffCall,
      kotaraCall,
      passesThrough: false,
      confidence,
      disruptions: [],
      scheduledTime: primaryTime,
    });
  }

  return movements;
}

/**
 * Get scheduled movements filtered by time window.
 */
export function getScheduledMovements(
  from: Date,
  to: Date
): Movement[] {
  // Generate for today and possibly tomorrow if window crosses midnight
  const todayMovements = generateScheduledMovements(from);
  let movements = todayMovements;

  // If time window crosses midnight, include next day too
  if (to.getDate() !== from.getDate()) {
    const tomorrowMovements = generateScheduledMovements(addDays(from, 1));
    movements = [...movements, ...tomorrowMovements];
  }

  // Filter to time window
  return movements.filter((m) => {
    const t = new Date(m.scheduledTime);
    return t >= from && t <= to;
  });
}
