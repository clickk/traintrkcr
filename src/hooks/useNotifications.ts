"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { Movement } from "@/lib/types";
import {
  WATCH_POINT_DISTANCE,
  CARDIFF_DISTANCE,
  KOTARA_DISTANCE,
  TOTAL_PATH_LENGTH,
} from "@/lib/rail-geometry";

// ─── Service Worker Registration ────────────────────────────────────────────

async function registerSW(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.register("/sw.js");
    return reg;
  } catch (err) {
    console.warn("SW registration failed:", err);
    return null;
  }
}

async function requestNotificationPermission(): Promise<boolean> {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}

// ─── Sound Alert ────────────────────────────────────────────────────────────

function createBeepSequence(ctx: AudioContext) {
  const now = ctx.currentTime;

  // Three ascending tones
  [440, 554, 659].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.3, now + i * 0.2);
    gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.2 + 0.18);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now + i * 0.2);
    osc.stop(now + i * 0.2 + 0.2);
  });
}

function speak(text: string) {
  if (!("speechSynthesis" in window)) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.1;
  utterance.pitch = 1.0;
  utterance.volume = 1.0;
  // Try to use an Australian English voice
  const voices = speechSynthesis.getVoices();
  const auVoice = voices.find(
    (v) => v.lang === "en-AU" || v.lang.startsWith("en-AU")
  );
  if (auVoice) utterance.voice = auVoice;
  speechSynthesis.speak(utterance);
}

// ─── Estimate time until a movement reaches the watch point ─────────────────

function estimateMinutesToWatchPoint(movement: Movement): number | null {
  const cardiffTime = movement.cardiffCall
    ? new Date(
        movement.cardiffCall.estimatedDeparture ||
          movement.cardiffCall.scheduledDeparture ||
          ""
      ).getTime()
    : null;
  const kotaraTime = movement.kotaraCall
    ? new Date(
        movement.kotaraCall.estimatedDeparture ||
          movement.kotaraCall.scheduledDeparture ||
          ""
      ).getTime()
    : null;

  if (!cardiffTime || !kotaraTime) return null;
  if (isNaN(cardiffTime) || isNaN(kotaraTime)) return null;

  const isTowardsNewcastle = movement.direction === "towards-newcastle";

  // Cardiff → watch point → Kotara (towards newcastle direction)
  // Kotara → watch point → Cardiff (towards sydney direction)
  const entryTime = isTowardsNewcastle ? cardiffTime : kotaraTime;
  const exitTime = isTowardsNewcastle ? kotaraTime : cardiffTime;
  const entryDist = isTowardsNewcastle ? CARDIFF_DISTANCE : KOTARA_DISTANCE;
  const exitDist = isTowardsNewcastle ? KOTARA_DISTANCE : CARDIFF_DISTANCE;

  if (exitTime === entryTime) return null;

  // Speed through corridor
  const speed = Math.abs(exitDist - entryDist) / (exitTime - entryTime);
  if (speed === 0) return null;

  // Time at watch point
  const watchDist = WATCH_POINT_DISTANCE;
  const watchTime =
    entryTime + (watchDist - entryDist) / (exitDist - entryDist) * (exitTime - entryTime);

  const minutesAway = (watchTime - Date.now()) / 60000;
  return minutesAway;
}

// ─── Hook ───────────────────────────────────────────────────────────────────

interface NotificationState {
  pushEnabled: boolean;
  soundEnabled: boolean;
  permissionGranted: boolean;
  togglePush: () => void;
  toggleSound: () => void;
  requestPermission: () => Promise<void>;
}

export function useNotifications(movements: Movement[]): NotificationState {
  const [pushEnabled, setPushEnabled] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const swRef = useRef<ServiceWorkerRegistration | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const notifiedRef = useRef<Set<string>>(new Set());
  const spokenRef = useRef<Set<string>>(new Set());

  // Register SW on mount
  useEffect(() => {
    registerSW().then((reg) => {
      swRef.current = reg;
    });
    if (typeof Notification !== "undefined") {
      setPermissionGranted(Notification.permission === "granted");
    }
  }, []);

  const requestPerm = useCallback(async () => {
    const granted = await requestNotificationPermission();
    setPermissionGranted(granted);
    if (granted) setPushEnabled(true);
  }, []);

  const togglePush = useCallback(() => {
    if (!permissionGranted) {
      requestPerm();
    } else {
      setPushEnabled((p) => !p);
    }
  }, [permissionGranted, requestPerm]);

  const toggleSound = useCallback(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext();
    }
    setSoundEnabled((s) => !s);
  }, []);

  // Check movements every 5 seconds for approaching trains
  useEffect(() => {
    if (!pushEnabled && !soundEnabled) return;

    const check = () => {
      for (const m of movements) {
        if (m.status === "cancelled" || m.status === "completed") continue;

        const mins = estimateMinutesToWatchPoint(m);
        if (mins === null) continue;

        const key = `${m.id}-${Math.round(mins)}`;

        // 1-minute alert
        if (mins > 0.3 && mins <= 1.5) {
          const alertKey = `${m.id}-1min`;

          if (pushEnabled && !notifiedRef.current.has(alertKey)) {
            notifiedRef.current.add(alertKey);
            // Send via service worker
            if (swRef.current?.active) {
              swRef.current.active.postMessage({
                type: "SHOW_NOTIFICATION",
                title: `${m.serviceType === "freight" ? "🚂" : "🚆"} Train ~1 min away`,
                body: `${m.direction === "towards-newcastle" ? "↑" : "↓"} ${m.destination} — ${m.operator}${m.consistType ? ` (${m.consistType})` : ""}`,
                tag: `train-${m.id}`,
              });
            }
          }

          if (soundEnabled && !spokenRef.current.has(alertKey)) {
            spokenRef.current.add(alertKey);
            // Beep + speech
            if (audioCtxRef.current) {
              createBeepSequence(audioCtxRef.current);
            }
            const dir =
              m.direction === "towards-newcastle" ? "northbound" : "southbound";
            const type = m.serviceType === "freight" ? "freight" : "passenger";
            const delayInfo =
              m.delayMinutes && m.delayMinutes > 0
                ? `, running ${m.delayMinutes} minutes late`
                : "";
            speak(
              `${type} train approaching. ${dir} to ${m.destination}. ${m.operator}${m.consistType ? `, ${m.consistType}` : ""}${delayInfo}. About 1 minute out.`
            );
          }
        }
      }
    };

    check();
    const interval = setInterval(check, 5000);
    return () => clearInterval(interval);
  }, [movements, pushEnabled, soundEnabled]);

  // Clean up old notification keys every minute
  useEffect(() => {
    const cleanup = setInterval(() => {
      notifiedRef.current.clear();
      spokenRef.current.clear();
    }, 120_000);
    return () => clearInterval(cleanup);
  }, []);

  return {
    pushEnabled,
    soundEnabled,
    permissionGranted,
    togglePush,
    toggleSound,
    requestPermission: requestPerm,
  };
}
