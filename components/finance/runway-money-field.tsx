import type { HouseholdRunwayAnswers } from "@/lib/finance/cushion";

function dollars(cents: number) {
  return cents === 0 ? "" : String(cents / 100);
}

function cents(value: string) {
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) : 0;
}

function currencySymbol(currency: string) {
  return { USD: "$", CAD: "CA$", CNY: "¥", TWD: "NT$" }[
    currency as "USD" | "CAD" | "CNY" | "TWD"
  ];
}

export function MoneyField({ label, help, currency, value, onChange }: {
  label: string;
  help?: string;
  currency: HouseholdRunwayAnswers["currency"];
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 flex items-center justify-between gap-3 text-sm font-medium"><span>{label}</span><span className="text-xs font-normal text-slate-400">{currency}</span></span>
      <span className="flex h-12 items-center rounded-xl border bg-white px-3 focus-within:ring-2 focus-within:ring-emerald-500 dark:bg-transparent">
        <span className="mr-2 text-slate-400">{currencySymbol(currency)}</span>
        <input aria-label={label} inputMode="decimal" type="text" className="h-full min-w-0 flex-1 bg-transparent outline-none" value={dollars(value)} placeholder="0" onChange={(event) => { if (/^\d*(?:\.\d{0,2})?$/.test(event.target.value.replace(/,/g, ""))) onChange(cents(event.target.value)); }} />
      </span>
      {help ? <span className="mt-2 block text-xs leading-5 text-slate-500">{help}</span> : null}
    </label>
  );
}
