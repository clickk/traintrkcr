"use client";

import { useState, useEffect } from "react";
import { WATCH_POINT } from "@/lib/stations";

export interface WeatherData {
  temperature: number;      // °C
  feelsLike: number;        // °C
  humidity: number;         // %
  windSpeed: number;        // km/h
  windDirection: number;    // degrees
  cloudCover: number;       // %
  visibility: number;       // km
  weatherCode: number;      // WMO code
  description: string;      // Human-readable
  isDay: boolean;
  fetchedAt: string;
}

// WMO weather code descriptions
function weatherDescription(code: number): string {
  const descriptions: Record<number, string> = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Foggy",
    48: "Depositing rime fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    61: "Slight rain",
    63: "Moderate rain",
    65: "Heavy rain",
    71: "Slight snow",
    73: "Moderate snow",
    75: "Heavy snow",
    77: "Snow grains",
    80: "Slight rain showers",
    81: "Moderate rain showers",
    82: "Violent rain showers",
    85: "Slight snow showers",
    86: "Heavy snow showers",
    95: "Thunderstorm",
    96: "Thunderstorm with slight hail",
    99: "Thunderstorm with heavy hail",
  };
  return descriptions[code] || "Unknown";
}

function windDirectionLabel(deg: number): string {
  const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return dirs[Math.round(deg / 22.5) % 16];
}

/**
 * Fetch weather from Open-Meteo (free, no API key).
 */
export function useWeather(): {
  weather: WeatherData | null;
  loading: boolean;
  error: string | null;
} {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchWeather() {
      try {
        const lat = WATCH_POINT.lat;
        const lng = WATCH_POINT.lng;
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,is_day,visibility&timezone=Australia%2FSydney`;

        const res = await fetch(url);
        if (!res.ok) throw new Error(`Weather API: ${res.status}`);
        const data = await res.json();
        const c = data.current;

        setWeather({
          temperature: c.temperature_2m,
          feelsLike: c.apparent_temperature,
          humidity: c.relative_humidity_2m,
          windSpeed: c.wind_speed_10m,
          windDirection: c.wind_direction_10m,
          cloudCover: c.cloud_cover,
          visibility: (c.visibility || 10000) / 1000, // metres to km
          weatherCode: c.weather_code,
          description: weatherDescription(c.weather_code),
          isDay: c.is_day === 1,
          fetchedAt: new Date().toISOString(),
        });
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Weather unavailable");
      } finally {
        setLoading(false);
      }
    }

    fetchWeather();
    const interval = setInterval(fetchWeather, 10 * 60 * 1000); // 10 min
    return () => clearInterval(interval);
  }, []);

  return { weather, loading, error };
}

export { windDirectionLabel };
