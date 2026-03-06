"use client";

import { cn } from "@/lib/utils";

interface BudgetRingProps {
  percent: number; // 0-100+ (can exceed 100 for over-budget)
  size?: number; // default 48
  strokeWidth?: number; // default 4
  color?: string; // override auto color
  className?: string;
}

function getAutoColor(percent: number): string {
  if (percent >= 90) return "hsl(var(--money-caution))";
  if (percent >= 75) return "hsl(var(--money-amber))";
  return "hsl(var(--money-sage))";
}

export function BudgetRing({
  percent,
  size = 48,
  strokeWidth = 4,
  color,
  className,
}: BudgetRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  // Cap visual arc at 100%
  const clampedPercent = Math.min(Math.max(percent, 0), 100);
  const strokeDashoffset =
    circumference - (clampedPercent / 100) * circumference;

  const strokeColor = color ?? getAutoColor(percent);

  return (
    <svg
      width={size}
      height={size}
      className={cn("transition-all duration-500", className)}
      style={{ transform: "rotate(-90deg)" }}
    >
      {/* Background track */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="hsl(var(--money-border))"
        strokeWidth={strokeWidth}
      />
      {/* Progress arc */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={strokeDashoffset}
        strokeLinecap="round"
        className="transition-all duration-500"
      />
    </svg>
  );
}
