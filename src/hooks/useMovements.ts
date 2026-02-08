"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { MovementFilters, MovementsResponse } from "@/lib/types";

const DEFAULT_FILTERS: MovementFilters = {
  station: "both",
  direction: "both",
  type: "all",
  status: "all",
  timeWindow: "now",
};

const REFRESH_INTERVAL = 20_000; // 20 seconds

export function useMovements(filters: MovementFilters = DEFAULT_FILTERS) {
  const [data, setData] = useState<MovementsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchMovements = useCallback(
    async (isAutoRefresh = false) => {
      // Cancel any in-flight request
      if (abortRef.current) {
        abortRef.current.abort();
      }
      abortRef.current = new AbortController();

      if (!isAutoRefresh) {
        setLoading(true);
      }

      try {
        const params = new URLSearchParams({
          station: filters.station,
          direction: filters.direction,
          type: filters.type,
          status: filters.status,
          timeWindow: filters.timeWindow,
        });

        const response = await fetch(`/api/movements?${params}`, {
          signal: abortRef.current.signal,
        });

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const result: MovementsResponse = await response.json();
        setData(result);
        setError(null);
        setLastRefresh(new Date());
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        setError(
          err instanceof Error ? err.message : "Failed to fetch movements"
        );
      } finally {
        setLoading(false);
      }
    },
    [filters]
  );

  // Initial fetch and auto-refresh
  useEffect(() => {
    fetchMovements(false);

    // Set up auto-refresh
    intervalRef.current = setInterval(() => {
      fetchMovements(true);
    }, REFRESH_INTERVAL);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, [fetchMovements]);

  const refresh = useCallback(() => {
    fetchMovements(false);
  }, [fetchMovements]);

  return {
    data,
    loading,
    error,
    lastRefresh,
    refresh,
  };
}
