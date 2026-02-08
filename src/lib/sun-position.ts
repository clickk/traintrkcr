/**
 * Sun position calculator for photography conditions.
 *
 * Computes solar azimuth and elevation for the watch point,
 * and determines whether the sun is favourable for photographing
 * trains heading in each direction.
 *
 * The track at the watch point runs roughly ENE–WSW (azimuth ~70°–250°).
 * - Towards Newcastle (northbound): trains face ~70° (ENE)
 * - Towards Sydney (southbound): trains face ~250° (WSW)
 */

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

// Track bearing at the watch point (approximately ENE)
const TRACK_BEARING_NEWCASTLE = 70; // degrees from north
const TRACK_BEARING_SYDNEY = 250;

export interface SunInfo {
  azimuth: number;      // degrees from north, 0=N, 90=E, 180=S, 270=W
  elevation: number;    // degrees above horizon
  isUp: boolean;
  goldenHour: boolean;  // elevation 0–15°
  blueHour: boolean;    // elevation -6°–0°

  // Photography assessment
  lightDirection: string;          // "front-lit", "back-lit", "side-lit"
  newcastleSideLight: string;      // which side for northbound trains: "good" | "ok" | "backlit"
  sydneySideLight: string;         // which side for southbound trains
  recommendation: string;          // human-readable summary
}

/**
 * Calculate sun position using simplified solar equations.
 * Accurate to ~1° for practical photography use.
 */
export function getSunPosition(
  lat: number,
  lng: number,
  date: Date = new Date()
): SunInfo {
  const dayOfYear = getDayOfYear(date);
  const hours = date.getUTCHours() + date.getUTCMinutes() / 60;

  // Solar declination (simplified)
  const declination = -23.45 * Math.cos(DEG * (360 / 365) * (dayOfYear + 10));

  // Equation of time (minutes)
  const B = (360 / 365) * (dayOfYear - 81) * DEG;
  const eot = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);

  // Solar time
  const solarNoon = 12 - lng / 15 - eot / 60; // UTC hours
  const hourAngle = (hours - solarNoon) * 15; // degrees

  // Elevation
  const sinElev =
    Math.sin(lat * DEG) * Math.sin(declination * DEG) +
    Math.cos(lat * DEG) * Math.cos(declination * DEG) * Math.cos(hourAngle * DEG);
  const elevation = Math.asin(sinElev) * RAD;

  // Azimuth
  const cosAz =
    (Math.sin(declination * DEG) - Math.sin(lat * DEG) * sinElev) /
    (Math.cos(lat * DEG) * Math.cos(elevation * DEG));
  let azimuth = Math.acos(Math.max(-1, Math.min(1, cosAz))) * RAD;
  if (hourAngle > 0) azimuth = 360 - azimuth;

  const isUp = elevation > 0;
  const goldenHour = elevation >= 0 && elevation <= 15;
  const blueHour = elevation >= -6 && elevation < 0;

  // Photography lighting assessment
  const sunAngleToNewcastle = angleDiff(azimuth, TRACK_BEARING_NEWCASTLE);
  const sunAngleToSydney = angleDiff(azimuth, TRACK_BEARING_SYDNEY);

  const newcastleSideLight = assessLighting(sunAngleToNewcastle);
  const sydneySideLight = assessLighting(sunAngleToSydney);

  let lightDirection: string;
  const sunAngleToTrack = Math.min(
    Math.abs(sunAngleToNewcastle),
    Math.abs(sunAngleToSydney)
  );
  if (sunAngleToTrack < 30) lightDirection = "along track";
  else if (sunAngleToTrack > 150) lightDirection = "along track (rear)";
  else if (sunAngleToTrack >= 60 && sunAngleToTrack <= 120)
    lightDirection = "side-lit";
  else lightDirection = "angled";

  let recommendation: string;
  if (!isUp) {
    recommendation = blueHour
      ? "Blue hour — moody low-light shots possible"
      : "Sun is down — no natural light";
  } else if (goldenHour) {
    recommendation = `Golden hour — warm light from ${compassDirection(azimuth)}. ${
      newcastleSideLight === "good" || sydneySideLight === "good"
        ? "Great conditions!"
        : "Watch for backlit subjects."
    }`;
  } else if (elevation > 60) {
    recommendation = "Midday — harsh overhead light, strong shadows under trains";
  } else {
    const goodDirs: string[] = [];
    if (newcastleSideLight === "good") goodDirs.push("northbound");
    if (sydneySideLight === "good") goodDirs.push("southbound");
    if (goodDirs.length > 0) {
      recommendation = `Good light on ${goodDirs.join(" & ")} trains from the ${compassDirection(azimuth)}`;
    } else {
      recommendation = `Sun from ${compassDirection(azimuth)} (${Math.round(elevation)}° high) — consider position for best angle`;
    }
  }

  return {
    azimuth: Math.round(azimuth * 10) / 10,
    elevation: Math.round(elevation * 10) / 10,
    isUp,
    goldenHour,
    blueHour,
    lightDirection,
    newcastleSideLight,
    sydneySideLight,
    recommendation,
  };
}

function angleDiff(a: number, b: number): number {
  let d = ((a - b + 540) % 360) - 180;
  return d;
}

function assessLighting(angleDiff: number): string {
  const abs = Math.abs(angleDiff);
  if (abs >= 60 && abs <= 120) return "good";    // Side-lit — ideal
  if (abs >= 30 && abs < 60) return "ok";         // Angled — acceptable
  if (abs > 120 && abs <= 150) return "ok";
  return "backlit";                                // Directly behind or in front
}

function compassDirection(azimuth: number): string {
  const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  const idx = Math.round(azimuth / 22.5) % 16;
  return dirs[idx];
}

function getDayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}
