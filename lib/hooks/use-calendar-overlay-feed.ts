"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";

import { setHabitCompletion } from "@/lib/hooks/use-habit-toggle";
import {
  overlayItemsToDisplayItems,
  type CalendarOverlayDisplayItem,
} from "@/lib/calendar/display";
import {
  CALENDAR_OVERLAY_LAYERS,
  type CalendarOverlayItem,
  type CalendarOverlayLayer,
} from "@/lib/calendar/overlay-feed";

export interface CalendarOverlayFeedRange {
  from: string;
  to: string;
}

export interface CalendarOverlayFeedSelection {
  range: CalendarOverlayFeedRange;
  layers: readonly CalendarOverlayLayer[];
}

type CalendarOverlayFeedStateBase = {
  items: CalendarOverlayDisplayItem[];
  unavailableLayers: CalendarOverlayLayer[];
};

export type CalendarOverlayFeedState =
  | (CalendarOverlayFeedStateBase & { status: "idle" })
  | (CalendarOverlayFeedStateBase & { status: "loading" })
  | (CalendarOverlayFeedStateBase & { status: "complete" })
  | (CalendarOverlayFeedStateBase & { status: "degraded" })
  | (CalendarOverlayFeedStateBase & { status: "failed" });

export type CalendarOverlayActionResult =
  | { success: true }
  | { success: false };

const layerSchema = z.enum(CALENDAR_OVERLAY_LAYERS);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const timeSchema = z.string().regex(/^\d{2}:\d{2}(?::\d{2})?$/);

const taskItemSchema = z.object({
  layer: z.literal("tasks"),
  kind: z.literal("task"),
  id: z.string().min(1),
  taskId: z.string().min(1),
  title: z.string(),
  date: dateSchema,
  startTime: timeSchema.nullable(),
  endTime: z.null(),
  allDay: z.boolean(),
  completed: z.boolean(),
  action: z.object({
    type: z.literal("toggle_task_completion"),
    taskId: z.string().min(1),
  }).strict(),
}).strict();

const habitItemSchema = z.object({
  layer: z.literal("habits"),
  kind: z.literal("habit"),
  id: z.string().min(1),
  habitId: z.string().min(1),
  title: z.string(),
  date: dateSchema,
  startTime: z.null(),
  endTime: z.null(),
  allDay: z.literal(true),
  completed: z.boolean(),
  action: z.object({
    type: z.literal("toggle_habit_completion"),
    habitId: z.string().min(1),
    date: dateSchema,
  }).strict(),
}).strict();

const workoutItemSchema = z.object({
  layer: z.literal("workouts"),
  kind: z.literal("workout"),
  id: z.string().min(1),
  workoutId: z.string().min(1),
  title: z.string(),
  date: dateSchema,
  startTime: timeSchema,
  endTime: z.null(),
  allDay: z.literal(false),
  completed: z.boolean(),
  action: z.object({
    type: z.literal("navigate_workout"),
    workoutId: z.string().min(1),
  }).strict(),
}).strict();

const overlayItemSchema = z.discriminatedUnion("layer", [
  taskItemSchema,
  habitItemSchema,
  workoutItemSchema,
]);

const responseSchema = z.object({
  items: z.array(overlayItemSchema),
  unavailableLayers: z.array(layerSchema).optional(),
}).strict();

type ValidatedResponse = z.infer<typeof responseSchema>;

const IDLE_STATE: CalendarOverlayFeedState = {
  status: "idle",
  items: [],
  unavailableLayers: [],
};

function emptyState(status: Exclude<CalendarOverlayFeedState["status"], "idle" | "loading">, unavailableLayers: CalendarOverlayLayer[] = []): CalendarOverlayFeedState {
  return { status, items: [], unavailableLayers };
}

function normalizeLayers(layers: readonly CalendarOverlayLayer[]): CalendarOverlayLayer[] {
  const selected = new Set(layers);
  return CALENDAR_OVERLAY_LAYERS.filter((layer) => selected.has(layer));
}

function itemIsInRange(item: CalendarOverlayDisplayItem, range: CalendarOverlayFeedRange): boolean {
  return item.start_date >= range.from && item.start_date <= range.to;
}

function isValidLocalDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) === value;
}

function retainItems(
  items: CalendarOverlayDisplayItem[],
  range: CalendarOverlayFeedRange,
  layers: readonly CalendarOverlayLayer[],
): CalendarOverlayDisplayItem[] {
  const selected = new Set(layers);
  return items.filter((item) => selected.has(item.layer) && itemIsInRange(item, range));
}

function responseItems(
  response: ValidatedResponse,
  range: CalendarOverlayFeedRange,
  layers: readonly CalendarOverlayLayer[],
): { items: CalendarOverlayDisplayItem[]; unavailableLayers: CalendarOverlayLayer[] } {
  const selected = new Set(layers);
  const unavailableLayers = CALENDAR_OVERLAY_LAYERS.filter((layer) =>
    response.unavailableLayers?.includes(layer) && selected.has(layer),
  );
  const availableItems = response.items.filter(
    (item) => selected.has(item.layer) && !unavailableLayers.includes(item.layer),
  );

  return {
    items: overlayItemsToDisplayItems(availableItems as CalendarOverlayItem[])
      .filter((item) => itemIsInRange(item, range)),
    unavailableLayers,
  };
}

function requestUrl(
  range: CalendarOverlayFeedRange,
  layers: readonly CalendarOverlayLayer[],
): string {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const params = [
    `start_date=${encodeURIComponent(range.from)}`,
    `end_date=${encodeURIComponent(range.to)}`,
    `layers=${layers.join(",")}`,
    `timezone=${encodeURIComponent(timezone)}`,
  ];
  return `/api/calendar/overlay-feed?${params.join("&")}`;
}

function selectedUnavailableLayers(
  layers: readonly CalendarOverlayLayer[],
): CalendarOverlayLayer[] {
  return [...layers];
}

export function useCalendarOverlayFeed({ range, layers }: CalendarOverlayFeedSelection) {
  const router = useRouter();
  const selectedLayers = useMemo(() => normalizeLayers(layers), [layers]);
  const layersKey = selectedLayers.join(",");
  const selectionKey = `${range.from}:${range.to}:${layersKey}`;
  const [state, setState] = useState<CalendarOverlayFeedState>(() =>
    selectedLayers.length > 0
      ? { status: "loading", items: [], unavailableLayers: [] }
      : IDLE_STATE,
  );
  const [isRetrying, setIsRetrying] = useState(false);
  const stateRef = useRef(state);
  const requestIdRef = useRef(0);
  const inFlightRef = useRef<{ key: string; promise: Promise<void> } | null>(null);
  const selectionRef = useRef({ range, layers: selectedLayers, key: selectionKey });

  selectionRef.current = { range, layers: selectedLayers, key: selectionKey };

  const updateState = useCallback((next: CalendarOverlayFeedState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const startRequest = useCallback((): Promise<void> => {
    const selection = selectionRef.current;
    if (selection.layers.length === 0) {
      updateState(IDLE_STATE);
      return Promise.resolve();
    }
    if (inFlightRef.current?.key === selection.key) {
      return inFlightRef.current.promise;
    }

    const requestId = ++requestIdRef.current;
    const prior = stateRef.current;
    const retainedItems = retainItems(prior.items, selection.range, selection.layers);
    const retainedUnavailable = prior.unavailableLayers.filter((layer) =>
      selection.layers.includes(layer),
    );
    updateState({
      status: "loading",
      items: retainedItems,
      unavailableLayers: retainedUnavailable,
    });

    const promise = (async () => {
      try {
        const result = await fetch(requestUrl(selection.range, selection.layers));
        if (!result.ok) throw new Error("Calendar Overlay Feed request failed");
        const parsed = responseSchema.safeParse(await result.json());
        if (!parsed.success) throw new Error("Calendar Overlay Feed response was invalid");

        const unavailableLayers = parsed.data.unavailableLayers ?? [];
        if (unavailableLayers.some((layer, index) => unavailableLayers.indexOf(layer) !== index)) {
          throw new Error("Calendar Overlay Feed response was invalid");
        }
        if (unavailableLayers.some((layer) => !selection.layers.includes(layer))) {
          throw new Error("Calendar Overlay Feed response was invalid");
        }
        if (parsed.data.items.some((item) =>
          !selection.layers.includes(item.layer) ||
          unavailableLayers.includes(item.layer) ||
          !isValidLocalDate(item.date),
        )) {
          throw new Error("Calendar Overlay Feed response was invalid");
        }
        if (parsed.data.items.some((item) => {
          if (item.layer === "tasks") {
            return item.taskId !== item.action.taskId || item.allDay !== (item.startTime === null);
          }
          if (item.layer === "habits") {
            return item.habitId !== item.action.habitId || item.date !== item.action.date;
          }
          return item.workoutId !== item.action.workoutId;
        })) {
          throw new Error("Calendar Overlay Feed response was invalid");
        }

        const projected = responseItems(parsed.data, selection.range, selection.layers);
        if (requestId !== requestIdRef.current) return;

        if (projected.unavailableLayers.length === 0) {
          updateState({ status: "complete", items: projected.items, unavailableLayers: [] });
        } else if (projected.unavailableLayers.length < selection.layers.length) {
          updateState({ status: "degraded", items: projected.items, unavailableLayers: projected.unavailableLayers });
        } else {
          updateState(emptyState("failed", selectedUnavailableLayers(selection.layers)));
        }
      } catch {
        if (requestId === requestIdRef.current) {
          updateState(emptyState("failed", selectedUnavailableLayers(selection.layers)));
        }
      }
    })();

    inFlightRef.current = { key: selection.key, promise };
    void promise.finally(() => {
      if (inFlightRef.current?.promise === promise) inFlightRef.current = null;
    });
    return promise;
  }, [updateState]);

  useEffect(() => {
    if (selectedLayers.length === 0) {
      requestIdRef.current += 1;
      inFlightRef.current = null;
      updateState(IDLE_STATE);
      return;
    }
    void startRequest();
  }, [selectionKey, selectedLayers.length, startRequest, updateState]);

  const retry = useCallback(async () => {
    if (selectionRef.current.layers.length === 0 || inFlightRef.current) return;
    setIsRetrying(true);
    try {
      await startRequest();
    } finally {
      setIsRetrying(false);
    }
  }, [startRequest]);

  const dispatchAction = useCallback(async (
    item: CalendarOverlayDisplayItem,
  ): Promise<CalendarOverlayActionResult> => {
    try {
      if (item.layer === "tasks") {
        const result = await fetch(`/api/tasks/${item.action.taskId}/toggle`, { method: "POST" });
        if (!result.ok) return { success: false };
        void startRequest();
        return { success: true };
      }
      if (item.layer === "habits") {
        await setHabitCompletion(item.action.habitId, !item.completed, item.action.date);
        void startRequest();
        return { success: true };
      }
      router.push(`/workouts/${item.action.workoutId}`);
      return { success: true };
    } catch {
      return { success: false };
    }
  }, [router, startRequest]);

  return {
    state,
    retry,
    isRetrying,
    dispatchAction,
  };
}
