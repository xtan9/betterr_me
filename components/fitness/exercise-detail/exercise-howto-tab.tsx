"use client";

import { useTranslations } from "next-intl";

interface ExerciseHowToTabProps {
  instructions: string[];
}

export function ExerciseHowToTab({ instructions }: ExerciseHowToTabProps) {
  const t = useTranslations("exercises");

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">
        {t("exerciseDetail.instructions")}
      </h3>
      <ol className="space-y-3 list-none">
        {instructions.map((instruction, index) => (
          <li key={index} className="flex gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-medium">
              {index + 1}
            </span>
            <p className="text-sm leading-relaxed pt-1">{instruction}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
