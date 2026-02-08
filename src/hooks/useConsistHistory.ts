"use client";

import { useState, useEffect, useCallback } from "react";
import type { Movement } from "@/lib/types";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ConsistSighting {
  vehicleId: string;
  carNumbers: string[];
  consistLength: number;
  tripId: string;
  runId: string;
  destination: string;
  direction: string;
  timestamp: string;    // ISO
}

export interface ConsistRecord {
  vehicleId: string;
  carNumbers: string[];
  consistLength: number;
  firstSeen: string;
  lastSeen: string;
  sightings: number;
  services: string[];   // unique runIds
}

const STORAGE_KEY = "traintrckr-consist-history";
const MAX_RECORDS = 200;

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useConsistHistory(movements: Movement[]) {
  const [records, setRecords] = useState<Map<string, ConsistRecord>>(new Map());

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const arr: ConsistRecord[] = JSON.parse(stored);
        const map = new Map<string, ConsistRecord>();
        arr.forEach((r) => map.set(r.vehicleId, r));
        setRecords(map);
      }
    } catch {
      // Corrupted data — start fresh
    }
  }, []);

  // Auto-record new sightings from movements with vehicle data
  useEffect(() => {
    let changed = false;
    const updated = new Map(records);

    for (const m of movements) {
      const vp = m.vehiclePosition;
      if (!vp?.vehicleId || !vp.carNumbers || vp.carNumbers.length === 0) continue;

      const existing = updated.get(vp.vehicleId);
      const now = new Date().toISOString();

      if (existing) {
        // Update existing record
        existing.lastSeen = now;
        existing.sightings++;
        if (m.runId && !existing.services.includes(m.runId)) {
          existing.services.push(m.runId);
        }
        changed = true;
      } else {
        // New sighting
        updated.set(vp.vehicleId, {
          vehicleId: vp.vehicleId,
          carNumbers: vp.carNumbers,
          consistLength: vp.consistLength || vp.carNumbers.length,
          firstSeen: now,
          lastSeen: now,
          sightings: 1,
          services: m.runId ? [m.runId] : [],
        });
        changed = true;
      }
    }

    if (changed) {
      // Trim to max records (oldest first)
      if (updated.size > MAX_RECORDS) {
        const sorted = [...updated.entries()].sort(
          (a, b) => new Date(a[1].lastSeen).getTime() - new Date(b[1].lastSeen).getTime()
        );
        while (sorted.length > MAX_RECORDS) sorted.shift();
        const trimmed = new Map(sorted);
        setRecords(trimmed);
        persist(trimmed);
      } else {
        setRecords(updated);
        persist(updated);
      }
    }
  }, [movements]); // eslint-disable-line react-hooks/exhaustive-deps

  const clearHistory = useCallback(() => {
    setRecords(new Map());
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return {
    records: [...records.values()].sort(
      (a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime()
    ),
    totalSightings: [...records.values()].reduce((sum, r) => sum + r.sightings, 0),
    uniqueConsists: records.size,
    clearHistory,
  };
}

function persist(map: Map<string, ConsistRecord>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...map.values()]));
  } catch {
    // Storage full — ignore
  }
}
