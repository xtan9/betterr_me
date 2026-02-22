import { describe, it, expect } from "vitest";
import {
  manualTransactionSchema,
  exchangeTokenSchema,
  webhookPayloadSchema,
} from "@/lib/validations/plaid";

describe("manualTransactionSchema", () => {
  const validData = {
    amount: 25.5,
    description: "Coffee at Starbucks",
    transaction_date: "2026-02-22",
    category: "food",
    account_id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
  };

  it("accepts valid data", () => {
    const result = manualTransactionSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it("accepts cash as account_id", () => {
    const result = manualTransactionSchema.safeParse({
      ...validData,
      account_id: "cash",
    });
    expect(result.success).toBe(true);
  });

  it("accepts data without optional category", () => {
    const { category: _category, ...withoutCategory } = validData;
    void _category;
    const result = manualTransactionSchema.safeParse(withoutCategory);
    expect(result.success).toBe(true);
  });

  it("rejects missing amount", () => {
    const { amount: _amount, ...withoutAmount } = validData;
    void _amount;
    const result = manualTransactionSchema.safeParse(withoutAmount);
    expect(result.success).toBe(false);
  });

  it("rejects negative amount", () => {
    const result = manualTransactionSchema.safeParse({
      ...validData,
      amount: -10,
    });
    expect(result.success).toBe(false);
  });

  it("rejects zero amount", () => {
    const result = manualTransactionSchema.safeParse({
      ...validData,
      amount: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing description", () => {
    const { description: _desc, ...withoutDescription } = validData;
    void _desc;
    const result = manualTransactionSchema.safeParse(withoutDescription);
    expect(result.success).toBe(false);
  });

  it("rejects empty description", () => {
    const result = manualTransactionSchema.safeParse({
      ...validData,
      description: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing transaction_date", () => {
    const { transaction_date: _date, ...withoutDate } = validData;
    void _date;
    const result = manualTransactionSchema.safeParse(withoutDate);
    expect(result.success).toBe(false);
  });

  it("rejects invalid date format", () => {
    const result = manualTransactionSchema.safeParse({
      ...validData,
      transaction_date: "02/22/2026",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing account_id", () => {
    const { account_id: _accId, ...withoutAccountId } = validData;
    void _accId;
    const result = manualTransactionSchema.safeParse(withoutAccountId);
    expect(result.success).toBe(false);
  });

  it("rejects invalid account_id (not UUID and not cash)", () => {
    const result = manualTransactionSchema.safeParse({
      ...validData,
      account_id: "invalid-id",
    });
    expect(result.success).toBe(false);
  });
});

describe("exchangeTokenSchema", () => {
  it("accepts valid public token", () => {
    const result = exchangeTokenSchema.safeParse({
      public_token: "public-sandbox-abc123",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing public_token", () => {
    const result = exchangeTokenSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects token not starting with public-", () => {
    const result = exchangeTokenSchema.safeParse({
      public_token: "access-sandbox-abc123",
    });
    expect(result.success).toBe(false);
  });
});

describe("webhookPayloadSchema", () => {
  it("accepts valid webhook payload", () => {
    const result = webhookPayloadSchema.safeParse({
      webhook_type: "TRANSACTIONS",
      webhook_code: "SYNC_UPDATES_AVAILABLE",
      item_id: "item-abc123",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing webhook_type", () => {
    const result = webhookPayloadSchema.safeParse({
      webhook_code: "SYNC_UPDATES_AVAILABLE",
      item_id: "item-abc123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing webhook_code", () => {
    const result = webhookPayloadSchema.safeParse({
      webhook_type: "TRANSACTIONS",
      item_id: "item-abc123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing item_id", () => {
    const result = webhookPayloadSchema.safeParse({
      webhook_type: "TRANSACTIONS",
      webhook_code: "SYNC_UPDATES_AVAILABLE",
    });
    expect(result.success).toBe(false);
  });
});
