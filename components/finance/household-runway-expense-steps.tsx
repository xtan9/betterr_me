"use client";

/** Expense category entry and reduction presentation. */

import type { ReactNode } from "react";

import { useTranslations } from "next-intl";

import { MoneyField } from "@/components/finance/runway-money-field";

import {
  type ExpenseCategory,
  formatCents,
  type ExpenseLineItem,
  type ExpenseFrequency,
} from "@/lib/finance/cushion";

import { type ExpenseItemType, EXPENSE_ITEM_TYPES } from "@/lib/finance/runway-expenses";

import type {
  HouseholdRunwayInterviewRuntimeScreen,
  HouseholdRunwayInterviewIntent,
} from "@/lib/finance/household-runway-interview-runtime";

import { ChoiceCard, InfoBox, SummaryValue } from "./household-runway-fields";

type HouseholdRunwayExpensesRenderModel = Extract<
  HouseholdRunwayInterviewRuntimeScreen,
  { kind: "expenses" }
>;

type HouseholdRunwayReductionsRenderModel = Extract<
  HouseholdRunwayInterviewRuntimeScreen,
  { kind: "reductions" }
>;

export function ExpenseHub({
  title,
  t,
  locale,
  model,
  dispatchInterviewCommand,
  onOpen,
}: {
  title: ReactNode;
  t: ReturnType<typeof useTranslations>;
  locale: string;
  model: HouseholdRunwayExpensesRenderModel;
  dispatchInterviewCommand: (input: HouseholdRunwayInterviewIntent) => unknown;
  onOpen: (category: ExpenseCategory) => void;
}) {
  const currency = model.location.currency ?? "USD";
  if (model.mode === "quick")
    return (
      <>
        {title}
        <button className="mt-4 text-sm font-semibold text-emerald-700 underline" onClick={() => dispatchInterviewCommand({ type: "set_expense_mode", mode: "guided" })}>
          {t("expenses.useGuided")}
        </button>
        <div className="mt-7 max-w-md">
          <MoneyField
            label={t("expenses.currentTotal")}
            currency={currency}
            value={model.quickExpenses.current_monthly_cents}
            onChange={(value) =>
              dispatchInterviewCommand({
                type: "set_quick_expenses",
                patch: { current_monthly_cents: value, confidence: "confirmed" },
              })
            }
          />
        </div>
      </>
    );
  return (
    <>
      {title}
      <div className="mt-6 rounded-2xl border bg-slate-50 p-4 dark:bg-white/5">
        <MoneyField
          label={t("expenses.currentTotal")}
          currency={currency}
          value={model.totals.current}
          help={t("expenses.totalSwitchHelp")}
          onChange={(value) =>
            dispatchInterviewCommand({
              type: "set_quick_expenses",
              patch: { current_monthly_cents: value, confidence: "confirmed" },
            })
          }
        />
      </div>
      <div className="mt-5 flex items-center justify-between gap-4">
        <p className="text-sm font-medium">{t("expenses.runningTotal", { amount: formatCents(model.totals.current, locale, currency) })}</p>
        <button className="text-sm font-semibold text-emerald-700 underline" onClick={() => dispatchInterviewCommand({ type: "set_expense_mode", mode: "quick" })}>
          {t("expenses.useTotals")}
        </button>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {model.categories.map((progress) => {
          const { category } = progress;
          return (
            <button key={category} onClick={() => onOpen(category)} className="flex min-h-24 items-center justify-between gap-4 rounded-2xl border p-4 text-left transition hover:border-emerald-400">
              <div>
                <p className="font-semibold">{t(`expenseCategories.${category}`)}</p>
                <p className="mt-1 text-xs text-slate-500">{progress.completed ? t("expenses.complete") : t("expenses.notStarted")}</p>
              </div>
              <span className="font-medium">{formatCents(progress.currentMonthlyCents, locale, currency)}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}

export function ExpenseCategoryEditor({
  category,
  t,
  model,
  dispatchInterviewCommand,
}: {
  category: ExpenseCategory;
  t: ReturnType<typeof useTranslations>;
  model: HouseholdRunwayExpensesRenderModel;
  dispatchInterviewCommand: (input: HouseholdRunwayInterviewIntent) => unknown;
}) {
  const currency = model.location.currency ?? "USD";
  const subtotal = model.categorySubtotals[category] ?? {
    current_monthly_cents: 0,
    interruption_monthly_cents: 0,
    confidence: "skipped" as const,
  };
  const housingTypes: ExpenseItemType[] =
    model.housingTenure === "own"
      ? ["mortgage", "property_tax", "homeowners_insurance", "hoa", "home_maintenance"]
      : model.housingTenure === "rent"
        ? ["rent", "renters_insurance", "building_parking"]
        : ["other_housing"];
  const types: readonly ExpenseItemType[] = category === "housing" ? housingTypes : EXPENSE_ITEM_TYPES[category];
  const updateItem = (type: ExpenseItemType, patch: Partial<ExpenseLineItem>) => {
    const existing = model.expenseItems.find(
      (item) => item.category === category && item.type === type,
    );
    dispatchInterviewCommand({
      type: "set_expense_item",
      category,
      itemType: type,
      itemId: existing?.id ?? `expense-${category}-${type}`,
      patch,
    });
  };
  return (
    <>
      <h1 id="runway-question-heading" tabIndex={-1} className="font-display text-3xl font-semibold tracking-[-.035em] outline-none sm:text-4xl">
        {t(`expenseCategories.${category}`)}
      </h1>
      <p className="mt-3 text-slate-500">{t(`expenses.categoryHelp.${category}`)}</p>
      <div className="mt-6 rounded-2xl border p-4">
        <MoneyField
          label={t("expenses.categoryTotal")}
          currency={currency}
          value={subtotal.current_monthly_cents}
          onChange={(value) =>
            dispatchInterviewCommand({
              type: "set_expense_category_subtotal",
              category,
              patch: {
                current_monthly_cents: value,
                interruption_monthly_cents:
                  subtotal.interruption_monthly_cents || value,
                confidence: "confirmed",
              },
            })
          }
        />
        <details
          className="mt-4 max-h-[55vh] overflow-auto rounded-xl border p-3"
          onToggle={(event) => {
            if ((event.currentTarget as HTMLDetailsElement).open) {
              dispatchInterviewCommand({
                type: "set_expense_category_mode",
                category,
                mode: "itemized",
              });
            }
          }}
        >
          <summary className="cursor-pointer font-semibold">{t("expenses.itemizeInstead")}</summary>
      {category === "housing" ? (
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {(["rent", "own", "other"] as const).map((tenure) => (
            <ChoiceCard
              key={tenure}
              selected={model.housingTenure === tenure}
              title={t(`expenses.tenure.${tenure}`)}
              onClick={() =>
                dispatchInterviewCommand({
                  type: "set_housing_tenure",
                  tenure,
                })
              }
            />
          ))}
        </div>
      ) : null}
      {category === "housing" && model.housingTenure === "own" ? (
        <InfoBox>{t("expenses.escrowWarning")}</InfoBox>
      ) : null}
      {category !== "housing" || model.housingTenure ? (
        <div className="mt-6 space-y-4">
          {types.map((type) => {
            const item = model.expenseItems.find((candidate) => candidate.category === category && candidate.type === type);
            return (
              <div key={type} className="grid gap-3 rounded-2xl border p-4 sm:grid-cols-[1fr_170px]">
                <MoneyField label={t(`expenseItems.${type}`)} currency={currency} value={item?.current_amount_cents ?? 0} onChange={(value) => updateItem(type, { current_amount_cents: value, confidence: "confirmed" })} />
                <label>
                  <span className="mb-2 block text-sm font-medium">{t("expenses.frequency")}</span>
                  <select aria-label={`${t(`expenseItems.${type}`)} · ${t("expenses.frequency")}`} className="h-12 w-full rounded-xl border bg-transparent px-3" value={item?.frequency ?? "monthly"} onChange={(event) => updateItem(type, { frequency: event.target.value as ExpenseFrequency })}>
                    {(["monthly", "quarterly", "annual"] as const).map((frequency) => <option key={frequency} value={frequency}>{t(`expenses.frequencies.${frequency}`)}</option>)}
                  </select>
                </label>
              </div>
            );
          })}
        </div>
      ) : null}
        </details>
      </div>
    </>
  );
}

export function ReductionStep({
  title,
  t,
  locale,
  model,
  dispatchInterviewCommand,
}: {
  title: ReactNode;
  t: ReturnType<typeof useTranslations>;
  locale: string;
  model: HouseholdRunwayReductionsRenderModel;
  dispatchInterviewCommand: (input: HouseholdRunwayInterviewIntent) => unknown;
}) {
  const currency = model.location.currency ?? "USD";
  return (
    <>
      {title}
      <div className="mt-5 grid gap-3 rounded-2xl bg-slate-50 p-4 sm:grid-cols-2 dark:bg-white/5">
        <SummaryValue label={t("expenses.currentTotal")} value={formatCents(model.totals.current, locale, currency)} />
        <SummaryValue label={t("expenses.afterInterruption")} value={formatCents(model.totals.interruption, locale, currency)} />
      </div>
      <div className="mt-5 space-y-3">
        {model.mode === "quick" ? (
          <div className="rounded-2xl border p-4">
            <MoneyField
              label={t("expenses.afterInterruption")}
              currency={currency}
              value={model.quickExpenses.interruption_monthly_cents}
              onChange={(value) =>
                dispatchInterviewCommand({
                  type: "set_reduction",
                  target: { kind: "quick" },
                  interruptionMonthlyCents: value,
                })
              }
            />
          </div>
        ) : null}
        {model.mode === "guided"
          ? Object.entries(model.categorySubtotals)
              .filter(
                ([category, subtotal]) =>
                  model.categoryModes[category as ExpenseCategory] === "subtotal" &&
                  (subtotal?.current_monthly_cents ?? 0) > 0,
              )
              .map(([category, subtotal]) => {
                if (!subtotal) return null;
                const expenseCategory = category as ExpenseCategory;
                return (
                  <div key={category} className="grid items-end gap-3 rounded-2xl border p-4 sm:grid-cols-[1fr_220px]">
                    <div>
                      <p className="font-medium">{t(`expenseCategories.${category}`)}</p>
                      <p className="mt-1 text-xs text-slate-500">{formatCents(subtotal.current_monthly_cents, locale, currency)}</p>
                    </div>
                    <MoneyField
                      label={t("expenses.afterInterruption")}
                      currency={currency}
                      value={subtotal.interruption_monthly_cents}
                      onChange={(value) =>
                        dispatchInterviewCommand({
                          type: "set_reduction",
                          target: { kind: "category", category: expenseCategory },
                          interruptionMonthlyCents: value,
                        })
                      }
                    />
                  </div>
                );
              })
          : null}
        {model.expenseItems
          .filter(
            (item) =>
              model.categoryModes[item.category] === "itemized" &&
              item.current_amount_cents > 0,
          )
          .map((item) => (
          <div key={item.id} className="grid items-end gap-3 rounded-2xl border p-4 sm:grid-cols-[1fr_220px]">
            <div>
              <p className="font-medium">{t(`expenseItems.${item.type}`)}</p>
              <p className="mt-1 text-xs text-slate-500">{t("expenses.currentEntered", { amount: formatCents(item.current_amount_cents, locale, currency), frequency: t(`expenses.frequencies.${item.frequency}`) })}</p>
            </div>
            <MoneyField
              label={t("expenses.afterInterruption")}
              currency={currency}
              value={item.interruption_amount_cents}
              onChange={(value) =>
                dispatchInterviewCommand({
                  type: "set_reduction",
                  target: { kind: "item", itemId: item.id },
                  interruptionMonthlyCents: value,
                })
              }
            />
          </div>
          ))}
      </div>
    </>
  );
}
