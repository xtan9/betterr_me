import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { WorkoutSetRow } from "@/components/fitness/workout-logger/workout-set-row";
import { WorkoutHistoryCard } from "@/components/fitness/workout-history/workout-history-card";
import type { WeightUnit, WorkoutSet } from "@/lib/db/types";
import en from "@/i18n/messages/en.json";
import zh from "@/i18n/messages/zh.json";
import zhTW from "@/i18n/messages/zh-TW.json";

const set: WorkoutSet = {
  id: "set-1", workout_exercise_id: "entry-1", set_number: 1, set_type: "normal",
  weight_kg: 10, reps: 5, duration_seconds: null, distance_meters: null, rpe: null,
  is_completed: false, created_at: "2026-10-25T00:00:00Z", updated_at: "2026-10-25T00:00:00Z",
};

const locales = [
  { locale: "en", messages: en, assistance: "Assistance", addedLoad: "Added load",
    invalid: "Enter a complete, valid measurement.", kept: "Unfinished input stays in kg.",
    unavailable: "This workout uses a recording format that cannot be read here. Update the app to view its recorded details." },
  { locale: "zh", messages: zh, assistance: "辅助重量", addedLoad: "额外负重",
    invalid: "请输入完整有效的测量值。", kept: "未完成的输入仍以 kg 为单位。",
    unavailable: "此训练采用当前无法读取的记录格式。请更新应用以查看已记录的详情。" },
  { locale: "zh-TW", messages: zhTW, assistance: "輔助重量", addedLoad: "額外負重",
    invalid: "請輸入完整有效的測量值。", kept: "未完成的輸入仍以 kg 為單位。",
    unavailable: "此訓練採用目前無法讀取的記錄格式。請更新應用程式以查看已記錄的詳情。" },
];

describe("recording messages through the actual locale provider", () => {
  it.each(locales)("labels loads, unfinished input, and unreadable history in $locale", (copy) => {
    const onError = vi.fn();
    const rowActions = { onUpdate: vi.fn().mockResolvedValue(undefined), onDelete: async () => {}, onComplete: async () => {} };
    const content = (unit: WeightUnit) => (
      <NextIntlClientProvider locale={copy.locale} messages={copy.messages} timeZone="UTC" onError={onError}>
        <WorkoutSetRow {...rowActions} set={set} exerciseType="assisted_bodyweight" weightUnit={unit} previousSet={null} />
        <WorkoutSetRow {...rowActions} set={{ ...set, id: "set-2" }} exerciseType="weighted_bodyweight" weightUnit={unit} previousSet={null} />
        <WorkoutHistoryCard weightUnit={unit} workout={{
          id: "workout-1", title: "Recorded workout", notes: null,
          started_at: "2026-10-25T00:00:00Z", completed_at: "2026-10-25T00:01:00Z", duration_seconds: 60,
          recordedStatus: "unsupported", exerciseCount: null, totalSets: null, totalVolume: null, exerciseNames: [],
        }} />
      </NextIntlClientProvider>
    );
    const { rerender } = render(content("kg"));
    expect(screen.getByRole("textbox", { name: `${copy.addedLoad} (kg)` })).toHaveValue("10");
    fireEvent.change(screen.getByRole("textbox", { name: `${copy.assistance} (kg)` }), { target: { value: "12." } });
    rerender(content("lbs"));
    expect(screen.getByRole("textbox", { name: `${copy.assistance} (kg)` })).toHaveValue("12.");
    expect(screen.getByText(copy.invalid)).toBeInTheDocument();
    expect(screen.getByText(copy.kept)).toBeInTheDocument();
    expect(screen.getByText(copy.unavailable)).toBeInTheDocument();
    expect(rowActions.onUpdate).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });
});
