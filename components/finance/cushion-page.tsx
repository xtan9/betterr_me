"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Info, Save, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { PageBreadcrumbs } from "@/components/layouts/page-breadcrumbs";
import { PageHeader } from "@/components/layouts/page-header";
import {
  formatCents,
  parseDollarsToCents,
  type FinanceCushionView,
} from "@/lib/finance/cushion";

interface CushionPageProps {
  initialCushion: FinanceCushionView | null;
}

interface CushionFormValues {
  liquidResources: string;
  essentialExpenses: string;
  continuingIncome: string;
}

function getInitialFormValues(
  cushion: FinanceCushionView | null,
): CushionFormValues {
  return {
    liquidResources: cushion
      ? (cushion.liquid_resources_cents / 100).toFixed(2)
      : "",
    essentialExpenses: cushion
      ? (cushion.monthly_essential_expenses_cents / 100).toFixed(2)
      : "",
    continuingIncome: cushion
      ? (cushion.monthly_continuing_income_cents / 100).toFixed(2)
      : "0.00",
  };
}

interface AmountFieldProps {
  id: string;
  label: string;
  help: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  required?: boolean;
}

function AmountField({
  id,
  label,
  help,
  value,
  onChange,
  required = false,
}: AmountFieldProps) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={id}
        type="number"
        inputMode="decimal"
        min="0"
        step="0.01"
        value={value}
        onChange={onChange}
        required={required}
        aria-describedby={`${id}-help`}
      />
      <p id={`${id}-help`} className="text-sm text-muted-foreground">
        {help}
      </p>
    </div>
  );
}

function getPlanningStateLabel(
  planningState: FinanceCushionView["calculation"]["planning_state"],
  t: ReturnType<typeof useTranslations>,
) {
  if (planningState === "urgent") return t("states.urgent.label");
  if (planningState === "building") return t("states.building.label");
  return t("states.stronger.label");
}

export function CushionPage({ initialCushion }: CushionPageProps) {
  const t = useTranslations("financeCushion");
  const locale = useLocale();
  const router = useRouter();
  const [formValues, setFormValues] = useState(() =>
    getInitialFormValues(initialCushion),
  );
  const [savedCushion, setSavedCushion] = useState(initialCushion);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const updateField =
    (field: keyof CushionFormValues) =>
    (event: ChangeEvent<HTMLInputElement>) => {
      setFormValues((current) => ({
        ...current,
        [field]: event.target.value,
      }));
      setSavedMessage(null);
      setError(null);
    };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const liquidResources = parseDollarsToCents(formValues.liquidResources);
    const essentialExpenses = parseDollarsToCents(formValues.essentialExpenses);
    const continuingIncome = parseDollarsToCents(formValues.continuingIncome);

    if (
      liquidResources === null ||
      essentialExpenses === null ||
      essentialExpenses < 1 ||
      continuingIncome === null
    ) {
      setError(t("validation.invalid"));
      setSavedMessage(null);
      return;
    }

    setIsSaving(true);
    setError(null);
    setSavedMessage(null);

    try {
      const response = await fetch("/api/finance/cushion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          liquid_resources_cents: liquidResources,
          monthly_essential_expenses_cents: essentialExpenses,
          monthly_continuing_income_cents: continuingIncome,
        }),
      });
      const body = (await response.json().catch(() => null)) as {
        cushion?: FinanceCushionView;
        error?: string;
      } | null;

      if (!response.ok || !body?.cushion) {
        throw new Error(body?.error || t("saveError"));
      }

      setSavedCushion(body.cushion);
      setSavedMessage(t("saved"));
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t("saveError"));
    } finally {
      setIsSaving(false);
    }
  };

  const calculation = savedCushion?.calculation;
  const monthsText = calculation
    ? calculation.months_covered === null
      ? t("results.sixPlus")
      : t("results.months", {
          months: calculation.months_covered.toFixed(2),
        })
    : null;
  const progressValue = calculation
    ? calculation.months_covered === null
      ? 100
      : Math.min(100, Math.max(0, (calculation.months_covered / 6) * 100))
    : 0;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-section-gap">
      <div>
        <PageBreadcrumbs section="finance" itemName={t("title")} />
        <PageHeader title={t("title")} subtitle={t("subtitle")} />
      </div>

      <Alert>
        <Info />
        <AlertTitle>{t("disclaimer.title")}</AlertTitle>
        <AlertDescription>{t("disclaimer.description")}</AlertDescription>
      </Alert>

      <div className="grid gap-card-gap lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
        <Card>
          <CardHeader>
            <CardTitle>{t("inputs.title")}</CardTitle>
            <CardDescription>{t("inputs.description")}</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-6" onSubmit={handleSubmit}>
              <AmountField
                id="liquid-resources"
                label={t("inputs.liquidResources")}
                help={t("inputs.liquidResourcesHelp")}
                value={formValues.liquidResources}
                onChange={updateField("liquidResources")}
                required
              />
              <AmountField
                id="essential-expenses"
                label={t("inputs.essentialExpenses")}
                help={t("inputs.essentialExpensesHelp")}
                value={formValues.essentialExpenses}
                onChange={updateField("essentialExpenses")}
                required
              />
              <AmountField
                id="continuing-income"
                label={t("inputs.continuingIncome")}
                help={t("inputs.continuingIncomeHelp")}
                value={formValues.continuingIncome}
                onChange={updateField("continuingIncome")}
              />

              {error && (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              )}
              {savedMessage && (
                <p className="text-sm text-primary" role="status" aria-live="polite">
                  {savedMessage}
                </p>
              )}

              <Button type="submit" disabled={isSaving} className="w-full sm:w-fit">
                <Save />
                {isSaving ? t("saving") : t("save")}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card data-testid="cushion-result">
          <CardHeader>
            <CardTitle>{t("results.title")}</CardTitle>
            <CardDescription>{t("results.description")}</CardDescription>
          </CardHeader>
          <CardContent>
            {calculation && savedCushion ? (
              <div className="grid gap-5">
                <div className="rounded-card bg-primary/10 p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">
                        {t("results.planningSignal")}
                      </p>
                      <p className="mt-1 text-3xl font-semibold tracking-tight" data-testid="cushion-months">
                        {monthsText}
                      </p>
                    </div>
                    <ShieldCheck className="size-7 text-primary" aria-hidden="true" />
                  </div>
                  <Progress
                    value={progressValue}
                    className="mt-5"
                    aria-label={t("results.progressLabel")}
                  />
                </div>

                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-muted-foreground">
                    {t("results.state")}
                  </span>
                  <Badge
                    variant="outline"
                    className={
                      calculation.planning_state === "urgent"
                        ? "border-destructive/50 text-destructive"
                        : calculation.planning_state === "building"
                          ? "border-status-warning text-status-warning"
                          : "border-primary/50 text-primary"
                    }
                  >
                    {getPlanningStateLabel(calculation.planning_state, t)}
                  </Badge>
                </div>

                <div className="grid gap-3 text-sm">
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">
                      {t("results.monthlyShortfall")}
                    </span>
                    <span className="font-medium">
                      {formatCents(calculation.monthly_shortfall_cents, locale)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">
                      {t("results.liquidResources")}
                    </span>
                    <span className="font-medium">
                      {formatCents(savedCushion.liquid_resources_cents, locale)}
                    </span>
                  </div>
                </div>

                <p className="text-sm leading-relaxed text-muted-foreground">
                  {t("results.guidance")}
                </p>
              </div>
            ) : (
              <div className="flex min-h-56 items-center justify-center rounded-card border border-dashed p-6 text-center">
                <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
                  {t("results.empty")}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 sm:grid-cols-3" aria-label={t("states.title")}>
        <StateCard title={t("states.urgent.label")} description={t("states.urgent.description")} tone="urgent" />
        <StateCard title={t("states.building.label")} description={t("states.building.description")} tone="building" />
        <StateCard title={t("states.stronger.label")} description={t("states.stronger.description")} tone="stronger" />
      </div>
    </div>
  );
}

function StateCard({
  title,
  description,
  tone,
}: {
  title: string;
  description: string;
  tone: "urgent" | "building" | "stronger";
}) {
  return (
    <div
      className={`rounded-card border p-4 ${
        tone === "urgent"
          ? "border-destructive/30 bg-destructive/5"
          : tone === "building"
            ? "border-status-warning/30 bg-status-warning/5"
            : "border-primary/30 bg-primary/5"
      }`}
    >
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        {description}
      </p>
    </div>
  );
}
