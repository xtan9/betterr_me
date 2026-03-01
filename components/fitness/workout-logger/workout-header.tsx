"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Timer,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { toast } from "sonner";
import { log } from "@/lib/logger";
import type { ActiveWorkout } from "@/lib/hooks/use-active-workout";
import type { UseRestTimerReturn } from "@/lib/fitness/rest-timer";

// ---------------------------------------------------------------------------
// Stopwatch hook — timestamp-based elapsed timer
// ---------------------------------------------------------------------------

function useStopwatch(startedAt: string): string {
  const [elapsed, setElapsed] = useState("");

  useEffect(() => {
    const startTime = new Date(startedAt).getTime();

    const update = () => {
      const diff = Math.max(0, Date.now() - startTime);
      const totalSeconds = Math.floor(diff / 1000);
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;

      const mm = String(minutes).padStart(2, "0");
      const ss = String(seconds).padStart(2, "0");
      setElapsed(hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`);
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  return elapsed;
}

// ---------------------------------------------------------------------------
// WorkoutHeader
// ---------------------------------------------------------------------------

interface WorkoutHeaderProps {
  workout: ActiveWorkout;
  onUpdateWorkout: (updates: {
    title?: string;
    notes?: string | null;
  }) => Promise<void>;
  onFinish: () => Promise<void>;
  onDiscard: () => Promise<void>;
  restTimer: UseRestTimerReturn;
}

export function WorkoutHeader({
  workout,
  onUpdateWorkout,
  onFinish,
  onDiscard,
  restTimer,
}: WorkoutHeaderProps) {
  const t = useTranslations("workouts");
  const elapsed = useStopwatch(workout.started_at);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(workout.title);
  const [notesOpen, setNotesOpen] = useState(false);
  const [notesValue, setNotesValue] = useState(workout.notes ?? "");
  const titleInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Focus input when editing starts
  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditingTitle]);

  const handleTitleBlur = useCallback(() => {
    setIsEditingTitle(false);
    const trimmed = titleValue.trim();
    if (trimmed && trimmed !== workout.title) {
      void onUpdateWorkout({ title: trimmed }).catch((err) => {
        log.error("Failed to update workout title", err);
        toast.error(t("updateError"));
      });
    } else {
      setTitleValue(workout.title);
    }
  }, [titleValue, workout.title, onUpdateWorkout, t]);

  const handleTitleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.currentTarget.blur();
      } else if (e.key === "Escape") {
        setTitleValue(workout.title);
        setIsEditingTitle(false);
      }
    },
    [workout.title]
  );

  const handleNotesChange = useCallback(
    (value: string) => {
      setNotesValue(value);
      // Debounce PATCH for notes
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        void onUpdateWorkout({ notes: value || null }).catch((err) => {
          log.error("Failed to update workout notes", err);
          toast.error(t("updateError"));
        });
      }, 500);
    },
    [onUpdateWorkout, t]
  );

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <div className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        {/* Left: Timer + Title */}
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex items-center gap-1.5 text-sm font-mono text-muted-foreground">
            <Timer className="h-4 w-4" />
            <span>{elapsed}</span>
          </div>

          {isEditingTitle ? (
            <Input
              ref={titleInputRef}
              value={titleValue}
              onChange={(e) => setTitleValue(e.target.value)}
              onBlur={handleTitleBlur}
              onKeyDown={handleTitleKeyDown}
              className="h-8 text-sm font-semibold"
            />
          ) : (
            <button
              type="button"
              onClick={() => {
                setTitleValue(workout.title);
                setIsEditingTitle(true);
              }}
              className="truncate text-sm font-semibold hover:underline"
            >
              {workout.title}
            </button>
          )}
        </div>

        {/* Right: Finish button */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onDiscard}
            className="text-destructive hover:text-destructive"
          >
            <X className="h-4 w-4" />
          </Button>
          <Button size="sm" onClick={onFinish}>
            <CheckCircle2 className="mr-1.5 h-4 w-4" />
            {t("finish")}
          </Button>
        </div>
      </div>

      {/* Rest timer overlay */}
      {restTimer.isActive && (
        <div className="flex items-center justify-between border-t bg-primary/5 px-4 py-2">
          <div className="flex items-center gap-2 text-sm">
            <Timer className="h-4 w-4 text-primary" />
            <span className="font-mono font-semibold text-primary">
              {formatTime(restTimer.remaining)}
            </span>
            <span className="text-muted-foreground">{t("restTimer")}</span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => restTimer.adjust(-15)}
            >
              -15s
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => restTimer.adjust(15)}
            >
              +15s
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={restTimer.skip}
            >
              {t("skip")}
            </Button>
          </div>
        </div>
      )}

      {/* Workout notes */}
      <Collapsible open={notesOpen} onOpenChange={setNotesOpen}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center gap-1.5 border-t px-4 py-1.5 text-xs text-muted-foreground hover:bg-accent/50"
          >
            {notesOpen ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
            {t("workoutNotes")}
            {notesValue && !notesOpen && (
              <span className="ml-1 truncate text-foreground/60">
                — {notesValue}
              </span>
            )}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-4 pb-3">
            <Textarea
              value={notesValue}
              onChange={(e) => handleNotesChange(e.target.value)}
              placeholder={t("workoutNotesPlaceholder")}
              className="min-h-[60px] text-sm"
            />
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
