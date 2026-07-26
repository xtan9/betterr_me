"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Inputs = { accessibleCashCents?: number; essentialMonthlyExpensesCents?: number; myMonthlyIncomeCents?: number; partnerMonthlyIncomeCents?: number };

function dollarsToCents(value: string) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) : undefined;
}

export function FinancialSafetyCheckup() {
  const [amounts, setAmounts] = useState<Record<keyof Inputs, string>>({ accessibleCashCents: "", essentialMonthlyExpensesCents: "", myMonthlyIncomeCents: "", partnerMonthlyIncomeCents: "" });
  const [status, setStatus] = useState("Start with the amounts you know today.");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    fetch("/api/money/financial-safety-checkup").then(async (response) => {
      const data = await response.json();
      if (data.checkup?.inputs) setAmounts((current) => Object.fromEntries(Object.entries(current).map(([key]) => [key, data.checkup.inputs[key] === undefined ? "" : (data.checkup.inputs[key] / 100).toFixed(2)])) as Record<keyof Inputs, string>);
      setStatus(data.checkup ? "Resume your saved check-up." : "Start with the amounts you know today.");
    }).catch(() => setStatus("We could not load a saved check-up."));
  }, []);
  const update = (key: keyof Inputs, value: string) => setAmounts((current) => ({ ...current, [key]: value }));
  const save = async () => {
    setSaving(true);
    const inputs = Object.fromEntries(Object.entries(amounts).map(([key, value]) => [key, dollarsToCents(value)]).filter(([, value]) => value !== undefined));
    const response = await fetch("/api/money/financial-safety-checkup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ inputs, selectedScenario: "both_incomes_stop" }) });
    setSaving(false);
    setStatus(response.ok ? "Saved. You can return any time to continue." : "Your check-up could not be saved. Please try again.");
  };
  const value = (key: keyof Inputs) => amounts[key];
  return <section className="mx-auto max-w-xl rounded-card border bg-card p-6"><h1 className="text-2xl font-semibold">Financial Safety Cushion</h1><p className="mt-2 text-muted-foreground">{status}</p><div className="mt-6 space-y-4"><label className="block text-sm font-medium">Accessible cash<Input aria-label="Accessible cash" className="mt-1" inputMode="decimal" value={value("accessibleCashCents")} onChange={(event) => update("accessibleCashCents", event.target.value)} placeholder="0.00" /></label><label className="block text-sm font-medium">Essential monthly costs<Input aria-label="Essential monthly costs" className="mt-1" inputMode="decimal" value={value("essentialMonthlyExpensesCents")} onChange={(event) => update("essentialMonthlyExpensesCents", event.target.value)} placeholder="0.00" /></label><label className="block text-sm font-medium">My monthly income<Input aria-label="My monthly income" className="mt-1" inputMode="decimal" value={value("myMonthlyIncomeCents")} onChange={(event) => update("myMonthlyIncomeCents", event.target.value)} placeholder="0.00" /></label></div><Button className="mt-6" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save and continue"}</Button></section>;
}
