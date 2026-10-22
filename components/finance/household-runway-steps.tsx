"use client";

/** Selects the current Interview step from the Runtime screen. */

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

import { MoneyField } from "@/components/finance/runway-money-field";

import type { RunwayStepId, HouseholdRunwayAnswers } from "@/lib/finance/cushion";

import { normalizeRunwayLocale, RUNWAY_REGIONS } from "@/lib/finance/runway-regions";

import type {
  HouseholdRunwayInterviewRuntimeScreen,
  HouseholdRunwayInterviewIntent,
} from "@/lib/finance/household-runway-interview-runtime";

import { StepTitle, ChoiceCard, CheckCard } from "./household-runway-fields";

import { EmploymentPicker, IncomeEditor, OtherIncomeStep } from "./household-runway-income-steps";

import { AssetsStep } from "./household-runway-asset-step";

import { ExpenseCategoryEditor, ExpenseHub, ReductionStep } from "./household-runway-expense-steps";

import { ReviewStep } from "./household-runway-review-step";

export type HouseholdRunwayInterviewRenderModel = HouseholdRunwayInterviewRuntimeScreen;

export function StepContent({
  t,
  locale,
  renderModel,
  dispatchInterviewCommand,
}: {
  t: ReturnType<typeof useTranslations>;
  locale: string;
  renderModel: HouseholdRunwayInterviewRenderModel;
  dispatchInterviewCommand: (input: HouseholdRunwayInterviewIntent) => unknown;
}) {
  if (renderModel.stage === null) return null;
  const step = renderModel.stage as RunwayStepId;
  const title = <StepTitle step={step} t={t} />;
  const householdModel = renderModel.kind === "household" ? renderModel : null;
  const employmentModel = renderModel.kind === "employment" ? renderModel : null;
  const incomeModel =
    renderModel.kind === "myIncome" || renderModel.kind === "partnerIncome"
      ? renderModel
      : null;
  const otherIncomeModel = renderModel.kind === "otherIncome" ? renderModel : null;
  const cashModel = renderModel.kind === "cash" ? renderModel : null;
  const assetsModel = renderModel.kind === "assets" ? renderModel : null;
  const expensesModel = renderModel.kind === "expenses" ? renderModel : null;
  const reductionsModel = renderModel.kind === "reductions" ? renderModel : null;
  const reviewModel = renderModel.kind === "review" ? renderModel : null;
  if (step === "location") {
    const locationModel = renderModel.kind === "location" ? renderModel : null;
    if (!locationModel) return title;
    const regionLocale = normalizeRunwayLocale(locale);
    return (
      <>
        {title}
        <div className="mt-7 grid gap-3 sm:grid-cols-2">
          {locationModel.availableCountries.map((country) => (
            <ChoiceCard
              key={country}
              selected={locationModel.country === country}
              title={t(`countries.${country}`)}
              onClick={() => dispatchInterviewCommand({ type: "select_country", country })}
            />
          ))}
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label>
            <span className="mb-2 block text-sm font-medium">{t("fields.region")}</span>
            <select
              aria-label={t("fields.region")}
              className="h-12 w-full rounded-xl border bg-transparent px-3"
              value={locationModel.region ?? ""}
              disabled={!locationModel.country}
              onChange={(event) =>
                dispatchInterviewCommand({
                  type: "select_region",
                  region: event.target.value,
                })
              }
            >
              <option value="">{t("fields.selectRegion")}</option>
              {(locationModel.country
                ? RUNWAY_REGIONS[locationModel.country]
                : []
              ).map((region) => (
                <option key={region.code} value={region.code}>
                  {region.labels[regionLocale]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="mb-2 block text-sm font-medium">{t("fields.currency")}</span>
            <select
              aria-label={t("fields.currency")}
              className="h-12 w-full rounded-xl border bg-transparent px-3"
              disabled={!locationModel.country}
              value={locationModel.currency ?? locationModel.currencyProposal ?? ""}
              onChange={(event) =>
                dispatchInterviewCommand({
                  type: "select_currency",
                  currency: event.target.value as HouseholdRunwayAnswers["currency"],
                })
              }
            >
              <option value="" disabled>
                {t("fields.currency")}
              </option>
              {locationModel.availableCurrencies.map((currency) => (
                <option key={currency} value={currency}>{currency}</option>
              ))}
            </select>
            {locationModel.currency === null && locationModel.currencyProposal ? (
              <p className="mt-2 text-xs text-slate-500">
                {t("boundary.currencyProposal", { currency: locationModel.currencyProposal })}
              </p>
            ) : null}
          </label>
        </div>
        {locationModel.pendingCurrencyChange ? (
          <div role="alert" className="mt-5 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-400/40 dark:bg-amber-500/10 dark:text-amber-100">
            <p>{t("currencyChange.confirmation")}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() =>
                  dispatchInterviewCommand({ type: "reset_currency_entries" })
                }
              >
                {t("currencyChange.reset")}
              </Button>
              <Button
                onClick={() =>
                  dispatchInterviewCommand({ type: "retain_currency_entries" })
                }
              >
                {t("currencyChange.retain")}
              </Button>
            </div>
          </div>
        ) : null}
      </>
    );
  }
  if (step === "household") {
    if (!householdModel) return title;
    return (
      <>
        {title}
        <div className="mt-7 grid gap-3 sm:grid-cols-2">
          <ChoiceCard
            selected={!householdModel.sharesFinances}
            title={t("household.solo")}
            onClick={() =>
              dispatchInterviewCommand({
                type: "set_household",
                sharesFinances: false,
                hasChildren: householdModel.hasChildren,
                hasSupportObligations: householdModel.hasSupportObligations,
              })
            }
          />
          <ChoiceCard
            selected={householdModel.sharesFinances}
            title={t("household.shared")}
            description={t("household.sharedHelp")}
            onClick={() =>
              dispatchInterviewCommand({
                type: "set_household",
                sharesFinances: true,
                hasChildren: householdModel.hasChildren,
                hasSupportObligations: householdModel.hasSupportObligations,
              })
            }
          />
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <CheckCard
            checked={householdModel.hasChildren}
            label={t("household.children")}
            onChange={(checked) =>
              dispatchInterviewCommand({
                type: "set_household",
                sharesFinances: householdModel.sharesFinances,
                hasChildren: checked,
                hasSupportObligations: householdModel.hasSupportObligations,
              })
            }
          />
          <CheckCard
            checked={householdModel.hasSupportObligations}
            label={t("household.support")}
            onChange={(checked) =>
              dispatchInterviewCommand({
                type: "set_household",
                sharesFinances: householdModel.sharesFinances,
                hasChildren: householdModel.hasChildren,
                hasSupportObligations: checked,
              })
            }
          />
        </div>
      </>
    );
  }
  if (step === "employment") {
    if (!employmentModel) return title;
    return (
      <>
        {title}
        <EmploymentPicker
          t={t}
          label={t("employment.me")}
          value={employmentModel.mine}
          onChange={(employment) =>
            dispatchInterviewCommand({
              type: "set_employment",
              person: "mine",
              employment,
            })
          }
        />
        {employmentModel.sharesFinances && employmentModel.partner ? (
          <EmploymentPicker
            t={t}
            label={t("employment.partner")}
            value={employmentModel.partner}
            onChange={(employment) =>
              dispatchInterviewCommand({
                type: "set_employment",
                person: "partner",
                employment,
              })
            }
          />
        ) : null}
      </>
    );
  }
  if (step === "myIncome") {
    if (!incomeModel || incomeModel.person !== "mine") return title;
    return (
      <>
        {title}
        <IncomeEditor
          t={t}
          locale={locale}
          location={incomeModel.location}
          income={incomeModel.income}
          estimate={incomeModel.estimate}
          onChange={(patch) =>
            dispatchInterviewCommand({ type: "set_income", person: "mine", patch })
          }
        />
      </>
    );
  }
  if (step === "partnerIncome") {
    if (!incomeModel || incomeModel.person !== "partner") return title;
    return (
      <>
        {title}
        <IncomeEditor
          t={t}
          locale={locale}
          location={incomeModel.location}
          income={incomeModel.income}
          estimate={incomeModel.estimate}
          onChange={(patch) =>
            dispatchInterviewCommand({ type: "set_income", person: "partner", patch })
          }
        />
      </>
    );
  }
  if (step === "otherIncome") {
    if (!otherIncomeModel) return title;
    return (
      <OtherIncomeStep
        title={title}
        t={t}
        locale={locale}
        currency={otherIncomeModel.location.currency}
        sources={otherIncomeModel.sources}
        totalMonthlyCents={otherIncomeModel.totalMonthlyCents}
        dispatchInterviewCommand={dispatchInterviewCommand}
      />
    );
  }
  if (step === "cash")
    return (
      <>
        {title}
        {cashModel ? (
          <div className="mt-7 max-w-md">
            <MoneyField
              label={t("fields.availableCash")}
              currency={cashModel.location.currency ?? "USD"}
              value={cashModel.availableCash.cents}
              help={t("fields.availableCashHelp")}
              onChange={(value) =>
                dispatchInterviewCommand({
                  type: "set_cash",
                  value: { cents: value, confidence: "confirmed" },
                })
              }
            />
          </div>
        ) : null}
      </>
    );
  if (step === "assets")
    return assetsModel ? (
      <AssetsStep title={title} t={t} model={assetsModel} dispatchInterviewCommand={dispatchInterviewCommand} />
    ) : title;
  if (step === "expenses")
    return expensesModel?.activeCategory ? (
      <ExpenseCategoryEditor
        category={expensesModel.activeCategory}
        t={t}
        model={expensesModel}
        dispatchInterviewCommand={dispatchInterviewCommand}
      />
    ) : (
      expensesModel ? <ExpenseHub
        title={title}
        t={t}
        locale={locale}
        model={expensesModel}
        dispatchInterviewCommand={dispatchInterviewCommand}
        onOpen={(category) =>
          dispatchInterviewCommand({
            type: "set_active_expense_category",
            category,
          })
        }
      /> : title
    );
  if (step === "reductions")
    return reductionsModel ? (
      <ReductionStep title={title} t={t} locale={locale} model={reductionsModel} dispatchInterviewCommand={dispatchInterviewCommand} />
    ) : title;
  if (step === "review")
    return reviewModel ? <ReviewStep title={title} t={t} locale={locale} model={reviewModel} /> : title;
  return null;
}
