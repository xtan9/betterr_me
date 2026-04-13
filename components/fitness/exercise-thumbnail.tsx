"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Dumbbell } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { ExerciseMedia } from "@/lib/db/types";

interface ExerciseThumbnailProps {
  exerciseMedia: ExerciseMedia | null;
  exerciseName: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeClasses = {
  sm: "h-8 w-8",
  md: "h-10 w-10",
  lg: "h-16 w-16",
} as const;

const iconSizeClasses = {
  sm: "h-4 w-4",
  md: "h-5 w-5",
  lg: "h-8 w-8",
} as const;

export function ExerciseThumbnail({
  exerciseMedia,
  exerciseName,
  size = "md",
  className = "",
}: ExerciseThumbnailProps) {
  const t = useTranslations("exercises");
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const showGif =
    exerciseMedia?.gif_url &&
    exerciseMedia.media_status !== "broken" &&
    !hasError;

  return (
    <div
      className={`rounded-pill overflow-hidden bg-muted flex items-center justify-center shrink-0 ${sizeClasses[size]} ${className}`}
    >
      {showGif ? (
        <>
          {isLoading && (
            <Skeleton className={`rounded-pill ${sizeClasses[size]}`} />
          )}
          <img
            src={exerciseMedia.gif_url!}
            alt={t("exerciseThumbnailAlt", { name: exerciseName })}
            className="h-full w-full object-cover"
            onLoad={() => setIsLoading(false)}
            onError={() => {
              setHasError(true);
              setIsLoading(false);
            }}
            style={isLoading ? { display: "none" } : undefined}
          />
        </>
      ) : (
        <Dumbbell
          className={`text-muted-foreground ${iconSizeClasses[size]}`}
        />
      )}
    </div>
  );
}
