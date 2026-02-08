"use client";

import { format } from "date-fns";
import type { Movement } from "@/lib/types";
import MovementCard from "./MovementCard";

interface LiveBoardProps {
  movements: Movement[];
  onSelectMovement: (movement: Movement) => void;
}

export default function LiveBoard({
  movements,
  onSelectMovement,
}: LiveBoardProps) {
  // Split movements by station
  const cardiffMovements = movements.filter((m) => m.cardiffCall);
  const kotaraMovements = movements.filter((m) => m.kotaraCall);

  // Split each by direction
  const cardiffToNewcastle = cardiffMovements.filter(
    (m) => m.direction === "towards-newcastle"
  );
  const cardiffToSydney = cardiffMovements.filter(
    (m) => m.direction === "towards-sydney"
  );
  const kotaraToNewcastle = kotaraMovements.filter(
    (m) => m.direction === "towards-newcastle"
  );
  const kotaraToSydney = kotaraMovements.filter(
    (m) => m.direction === "towards-sydney"
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-4">
      {/* Cardiff Station */}
      <StationBoard
        stationName="Cardiff"
        stationColor="bg-blue-500"
        toNewcastle={cardiffToNewcastle}
        toSydney={cardiffToSydney}
        onSelect={onSelectMovement}
      />

      {/* Kotara Station */}
      <StationBoard
        stationName="Kotara"
        stationColor="bg-emerald-500"
        toNewcastle={kotaraToNewcastle}
        toSydney={kotaraToSydney}
        onSelect={onSelectMovement}
      />
    </div>
  );
}

function StationBoard({
  stationName,
  stationColor,
  toNewcastle,
  toSydney,
  onSelect,
}: {
  stationName: string;
  stationColor: string;
  toNewcastle: Movement[];
  toSydney: Movement[];
  onSelect: (m: Movement) => void;
}) {
  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl overflow-hidden">
      {/* Station Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-[var(--color-border)]">
        <span className={`w-3 h-3 rounded-full ${stationColor}`} />
        <h2 className="text-lg font-bold">{stationName} Station</h2>
        <span className="text-xs text-[var(--color-text-muted)] ml-auto">
          {toNewcastle.length + toSydney.length} movements
        </span>
      </div>

      <div className="divide-y divide-[var(--color-border)]">
        {/* To Newcastle */}
        <DirectionSection
          label="↑ Towards Newcastle"
          movements={toNewcastle}
          onSelect={onSelect}
        />

        {/* To Sydney */}
        <DirectionSection
          label="↓ Towards Sydney"
          movements={toSydney}
          onSelect={onSelect}
        />
      </div>
    </div>
  );
}

function DirectionSection({
  label,
  movements,
  onSelect,
}: {
  label: string;
  movements: Movement[];
  onSelect: (m: Movement) => void;
}) {
  return (
    <div className="px-4 py-3">
      <h3 className="text-xs uppercase tracking-wider text-[var(--color-text-muted)] font-medium mb-2">
        {label}
      </h3>
      {movements.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)] py-3 text-center italic">
          No movements in this direction
        </p>
      ) : (
        <div className="space-y-2">
          {movements.map((m) => (
            <MovementCard
              key={m.id}
              movement={m}
              onSelect={onSelect}
              compact
            />
          ))}
        </div>
      )}
    </div>
  );
}
