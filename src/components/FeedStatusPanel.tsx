"use client";

import { format } from "date-fns";
import type { FeedStatus } from "@/lib/types";

interface FeedStatusPanelProps {
  feeds: FeedStatus[];
}

function getStatusColor(status: FeedStatus["status"]): string {
  switch (status) {
    case "online":
      return "bg-green-400";
    case "degraded":
      return "bg-amber-400";
    case "offline":
      return "bg-red-400";
  }
}

function getStatusLabel(status: FeedStatus["status"]): string {
  switch (status) {
    case "online":
      return "Online";
    case "degraded":
      return "Degraded";
    case "offline":
      return "Offline";
  }
}

export default function FeedStatusPanel({ feeds }: FeedStatusPanelProps) {
  return (
    <div className="px-4 py-3 bg-[var(--color-surface)] border-t border-[var(--color-border)]">
      <div className="flex items-center gap-1.5 mb-2">
        <svg className="w-3.5 h-3.5 text-[var(--color-text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
        <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] font-medium">
          Data Feeds
        </span>
      </div>
      <div className="flex flex-wrap gap-3">
        {feeds.map((feed) => (
          <div
            key={feed.name}
            className="flex items-center gap-2 px-2.5 py-1.5 bg-[var(--color-surface-2)] rounded-lg"
          >
            <span
              className={`w-2 h-2 rounded-full ${getStatusColor(feed.status)} ${
                feed.status === "online" ? "" : "animate-pulse"
              }`}
            />
            <div>
              <div className="text-xs font-medium">{feed.name}</div>
              <div className="text-[10px] text-[var(--color-text-muted)]">
                {getStatusLabel(feed.status)}
                {feed.recordCount !== undefined && (
                  <> · {feed.recordCount} records</>
                )}
                {feed.lastSuccessful && (
                  <> · {format(new Date(feed.lastSuccessful), "HH:mm:ss")}</>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
