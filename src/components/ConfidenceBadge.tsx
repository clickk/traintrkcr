"use client";

import type { ConfidenceInfo, ConfidenceLevel } from "@/lib/types";

const CONFIDENCE_CONFIG: Record<
  ConfidenceLevel,
  { label: string; color: string; bgColor: string; icon: string }
> = {
  "confirmed-live": {
    label: "Confirmed Live",
    color: "text-green-400",
    bgColor: "bg-green-400/10 border-green-400/20",
    icon: "●",
  },
  "confirmed-updated": {
    label: "Confirmed Updated",
    color: "text-blue-400",
    bgColor: "bg-blue-400/10 border-blue-400/20",
    icon: "◉",
  },
  scheduled: {
    label: "Scheduled Only",
    color: "text-slate-400",
    bgColor: "bg-slate-400/10 border-slate-400/20",
    icon: "○",
  },
  "estimated-freight": {
    label: "Estimated Freight",
    color: "text-purple-400",
    bgColor: "bg-purple-400/10 border-purple-400/20",
    icon: "◈",
  },
};

interface ConfidenceBadgeProps {
  confidence: ConfidenceInfo;
  showReason?: boolean;
  compact?: boolean;
}

export default function ConfidenceBadge({
  confidence,
  showReason = false,
  compact = false,
}: ConfidenceBadgeProps) {
  const config = CONFIDENCE_CONFIG[confidence.level];

  if (compact) {
    return (
      <span
        className={`inline-flex items-center gap-1 text-xs ${config.color}`}
        title={confidence.reason}
      >
        <span className={confidence.level === "confirmed-live" ? "animate-pulse-live" : ""}>
          {config.icon}
        </span>
        {config.label}
      </span>
    );
  }

  return (
    <div className="space-y-1">
      <span
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded-full border ${config.bgColor} ${config.color}`}
      >
        <span className={confidence.level === "confirmed-live" ? "animate-pulse-live" : ""}>
          {config.icon}
        </span>
        {config.label}
      </span>
      {showReason && (
        <p className="text-xs text-[var(--color-text-muted)] pl-1">
          {confidence.reason}
        </p>
      )}
    </div>
  );
}
