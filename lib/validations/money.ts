import { z } from "zod";

/**
 * Validates a money amount (in dollars) that can be safely converted to cents.
 * Range: -999,999,999.99 to 999,999,999.99 (fits in BIGINT cents)
 */
export const moneyAmountSchema = z
  .number()
  .min(-999_999_999.99, "Amount too small")
  .max(999_999_999.99, "Amount too large")
  .refine(
    (val) => {
      // Ensure at most 2 decimal places
      const str = val.toString();
      const decimalIndex = str.indexOf(".");
      if (decimalIndex === -1) return true;
      return str.length - decimalIndex - 1 <= 2;
    },
    { message: "Amount must have at most 2 decimal places" }
  );

/**
 * Validates a UUID format for household_id.
 */
export const householdIdSchema = z.string().uuid("Invalid household ID format");
