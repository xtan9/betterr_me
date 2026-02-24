import { describe, it, expect } from "vitest";
import {
  inviteSchema,
  visibilityChangeSchema,
  transactionVisibilitySchema,
} from "@/lib/validations/household";

// =============================================================================
// inviteSchema
// =============================================================================

describe("inviteSchema", () => {
  it("accepts valid email", () => {
    const result = inviteSchema.safeParse({ email: "partner@example.com" });
    expect(result.success).toBe(true);
  });

  it("rejects invalid email", () => {
    const result = inviteSchema.safeParse({ email: "not-an-email" });
    expect(result.success).toBe(false);
  });

  it("rejects empty email", () => {
    const result = inviteSchema.safeParse({ email: "" });
    expect(result.success).toBe(false);
  });

  it("rejects missing email field", () => {
    const result = inviteSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("accepts email with subdomain", () => {
    const result = inviteSchema.safeParse({ email: "user@mail.example.com" });
    expect(result.success).toBe(true);
  });
});

// =============================================================================
// visibilityChangeSchema
// =============================================================================

describe("visibilityChangeSchema", () => {
  it("accepts 'mine'", () => {
    const result = visibilityChangeSchema.safeParse({ visibility: "mine" });
    expect(result.success).toBe(true);
  });

  it("accepts 'ours'", () => {
    const result = visibilityChangeSchema.safeParse({ visibility: "ours" });
    expect(result.success).toBe(true);
  });

  it("accepts 'hidden'", () => {
    const result = visibilityChangeSchema.safeParse({ visibility: "hidden" });
    expect(result.success).toBe(true);
  });

  it("rejects invalid visibility value", () => {
    const result = visibilityChangeSchema.safeParse({ visibility: "public" });
    expect(result.success).toBe(false);
  });

  it("rejects empty string", () => {
    const result = visibilityChangeSchema.safeParse({ visibility: "" });
    expect(result.success).toBe(false);
  });

  it("rejects missing visibility field", () => {
    const result = visibilityChangeSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

// =============================================================================
// transactionVisibilitySchema
// =============================================================================

describe("transactionVisibilitySchema", () => {
  it("accepts is_hidden_from_household boolean", () => {
    const result = transactionVisibilitySchema.safeParse({
      is_hidden_from_household: true,
    });
    expect(result.success).toBe(true);
  });

  it("accepts is_shared_to_household boolean", () => {
    const result = transactionVisibilitySchema.safeParse({
      is_shared_to_household: true,
    });
    expect(result.success).toBe(true);
  });

  it("accepts both fields together", () => {
    const result = transactionVisibilitySchema.safeParse({
      is_hidden_from_household: false,
      is_shared_to_household: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.is_hidden_from_household).toBe(false);
      expect(result.data.is_shared_to_household).toBe(true);
    }
  });

  it("rejects non-boolean is_hidden_from_household", () => {
    const result = transactionVisibilitySchema.safeParse({
      is_hidden_from_household: "yes",
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-boolean is_shared_to_household", () => {
    const result = transactionVisibilitySchema.safeParse({
      is_shared_to_household: 1,
    });
    expect(result.success).toBe(false);
  });

  it("accepts empty object (both fields optional)", () => {
    const result = transactionVisibilitySchema.safeParse({});
    expect(result.success).toBe(true);
  });
});
