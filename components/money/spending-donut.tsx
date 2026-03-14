"use client";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useTranslations } from "next-intl";
import { formatMoney } from "@/lib/money/arithmetic";

interface SpendingDonutData {
  categoryId: string;
  name: string;
  value: number; // cents
  color: string;
}

interface SpendingDonutProps {
  data: SpendingDonutData[];
  totalCents: number;
  onCategoryClick?: (categoryId: string) => void;
}

const DEFAULT_COLORS = [
  "#6b9080", // sage
  "#a4c3b2", // sage-light
  "#cce3de", // pale sage
  "#eaf4f4", // lightest sage
  "#b4a7d6", // lavender
  "#d5c4a1", // sand
  "#9fc5e8", // sky
  "#f6b26b", // amber
];

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: SpendingDonutData }>;
}) {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload;
  const total = payload[0].payload.value;

  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="font-medium">{item.name}</p>
      <p className="tabular-nums text-muted-foreground">
        {formatMoney(total)}
      </p>
    </div>
  );
}

export function SpendingDonut({
  data,
  totalCents,
  onCategoryClick,
}: SpendingDonutProps) {
  const t = useTranslations("money.budgets");

  if (data.length === 0) {
    return (
      <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
        {t("noSpendingData")}
      </div>
    );
  }

  return (
    <div className="h-[300px] relative">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={100}
            dataKey="value"
            onClick={(_, index) =>
              onCategoryClick?.(data[index].categoryId)
            }
            className="cursor-pointer"
          >
            {data.map((entry, index) => (
              <Cell
                key={entry.categoryId}
                fill={entry.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length]}
              />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
        </PieChart>
      </ResponsiveContainer>
      {/* Center total */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="text-center">
          <p className="text-lg font-bold tabular-nums">
            {formatMoney(totalCents)}
          </p>
          <p className="text-xs text-muted-foreground">{t("spent")}</p>
        </div>
      </div>
    </div>
  );
}
