export type ExpenseCategory =
  | "housing"
  | "utilities"
  | "transportation"
  | "food"
  | "healthcare"
  | "insurance"
  | "childcare"
  | "debt"
  | "support"
  | "other";

export const EXPENSE_CATEGORIES = [
  "housing",
  "utilities",
  "transportation",
  "food",
  "healthcare",
  "insurance",
  "childcare",
  "debt",
  "support",
  "other",
] as const satisfies readonly ExpenseCategory[];

export const EXPENSE_ITEM_TYPES = {
  housing: [
    "mortgage",
    "property_tax",
    "homeowners_insurance",
    "hoa",
    "home_maintenance",
    "rent",
    "renters_insurance",
    "building_parking",
    "other_housing",
  ],
  utilities: ["electricity", "home_gas", "water_trash", "internet", "phone"],
  transportation: [
    "vehicle_payment",
    "car_insurance",
    "fuel_charging",
    "parking_tolls",
    "vehicle_maintenance",
    "public_transit",
  ],
  food: ["groceries", "essential_meals"],
  healthcare: ["health_premium", "prescriptions", "necessary_care"],
  insurance: ["life_insurance", "disability_insurance", "other_insurance"],
  childcare: ["childcare", "tuition", "child_essentials"],
  debt: ["credit_card_minimum", "student_loan", "personal_loan", "other_debt"],
  support: ["parent_support", "child_support", "other_support"],
  other: ["other_commitment"],
} as const;

export type ExpenseItemType =
  (typeof EXPENSE_ITEM_TYPES)[keyof typeof EXPENSE_ITEM_TYPES][number];

export const EXPENSE_ITEM_TYPE_VALUES = Object.values(EXPENSE_ITEM_TYPES).flat() as [
  ExpenseItemType,
  ...ExpenseItemType[],
];

export function isExpenseItemType(value: unknown): value is ExpenseItemType {
  return typeof value === "string" &&
    (EXPENSE_ITEM_TYPE_VALUES as readonly string[]).includes(value);
}
