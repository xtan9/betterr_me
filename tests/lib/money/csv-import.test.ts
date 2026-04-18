import { describe, it, expect } from "vitest";
import {
  autoMapColumns,
  transactionDuplicateKey,
  detectDuplicates,
  COLUMN_ALIASES,
  TARGET_FIELDS,
  MAX_IMPORT_ROWS,
  getColumnAliases,
} from "@/lib/money/csv-import";

// ---------------------------------------------------------------------------
// Constants — pin exact values to kill literal mutants
// ---------------------------------------------------------------------------

describe("MAX_IMPORT_ROWS constant", () => {
  it("is exactly 5000", () => {
    expect(MAX_IMPORT_ROWS).toBe(5000);
  });
});

describe("TARGET_FIELDS constant", () => {
  it("lists the target fields in the exact schema order", () => {
    expect(TARGET_FIELDS).toEqual([
      "transaction_date",
      "amount",
      "description",
      "merchant_name",
      "category",
    ]);
  });
});

describe("getColumnAliases / COLUMN_ALIASES", () => {
  // Tests call getColumnAliases() fresh so Stryker sees each alias string
  // as covered by these tests (the module-level COLUMN_ALIASES const is
  // cached at init and mutations there aren't observable via reads).
  it("transaction_date aliases match the exact list", () => {
    expect(getColumnAliases().transaction_date).toEqual([
      "date",
      "transaction date",
      "trans date",
      "posting date",
      "posted date",
    ]);
  });

  it("amount aliases match the exact list", () => {
    expect(getColumnAliases().amount).toEqual([
      "amount",
      "debit",
      "credit",
      "transaction amount",
      "sum",
    ]);
  });

  it("description aliases match the exact list", () => {
    expect(getColumnAliases().description).toEqual([
      "description",
      "memo",
      "details",
      "narrative",
      "payee",
      "name",
    ]);
  });

  it("merchant_name aliases match the exact list", () => {
    expect(getColumnAliases().merchant_name).toEqual([
      "merchant",
      "merchant name",
      "payee",
    ]);
  });

  it("category aliases match the exact list", () => {
    expect(getColumnAliases().category).toEqual([
      "category",
      "type",
      "classification",
    ]);
  });

  it("exported COLUMN_ALIASES const mirrors getColumnAliases() (back-compat)", () => {
    expect(COLUMN_ALIASES).toEqual(getColumnAliases());
  });
});

// ---------------------------------------------------------------------------
// autoMapColumns
// ---------------------------------------------------------------------------

describe("autoMapColumns", () => {
  // Individual alias-match tests — each one kills a specific alias string
  // being mutated to empty.
  describe("exact-match pass 1: every alias is recognised", () => {
    // transaction_date
    it("matches alias 'date' to transaction_date", () => {
      expect(autoMapColumns(["date"]).transaction_date).toBe("date");
    });
    it("matches alias 'transaction date' to transaction_date", () => {
      expect(autoMapColumns(["transaction date"]).transaction_date).toBe(
        "transaction date"
      );
    });
    it("matches alias 'trans date' to transaction_date", () => {
      expect(autoMapColumns(["trans date"]).transaction_date).toBe(
        "trans date"
      );
    });
    it("matches alias 'posting date' to transaction_date", () => {
      expect(autoMapColumns(["posting date"]).transaction_date).toBe(
        "posting date"
      );
    });
    it("matches alias 'posted date' to transaction_date", () => {
      expect(autoMapColumns(["posted date"]).transaction_date).toBe(
        "posted date"
      );
    });

    // amount
    it("matches alias 'amount' to amount", () => {
      expect(autoMapColumns(["amount"]).amount).toBe("amount");
    });
    it("matches alias 'debit' to amount", () => {
      expect(autoMapColumns(["debit"]).amount).toBe("debit");
    });
    it("matches alias 'credit' to amount", () => {
      expect(autoMapColumns(["credit"]).amount).toBe("credit");
    });
    it("matches alias 'transaction amount' to amount", () => {
      expect(autoMapColumns(["transaction amount"]).amount).toBe(
        "transaction amount"
      );
    });
    it("matches alias 'sum' to amount", () => {
      expect(autoMapColumns(["sum"]).amount).toBe("sum");
    });

    // description
    it("matches alias 'description' to description", () => {
      expect(autoMapColumns(["description"]).description).toBe("description");
    });
    it("matches alias 'memo' to description", () => {
      expect(autoMapColumns(["memo"]).description).toBe("memo");
    });
    it("matches alias 'details' to description", () => {
      expect(autoMapColumns(["details"]).description).toBe("details");
    });
    it("matches alias 'narrative' to description", () => {
      expect(autoMapColumns(["narrative"]).description).toBe("narrative");
    });
    it("matches alias 'name' to description", () => {
      expect(autoMapColumns(["name"]).description).toBe("name");
    });

    // merchant_name
    it("matches alias 'merchant' to merchant_name", () => {
      expect(autoMapColumns(["merchant"]).merchant_name).toBe("merchant");
    });
    it("matches alias 'merchant name' to merchant_name", () => {
      expect(autoMapColumns(["merchant name"]).merchant_name).toBe(
        "merchant name"
      );
    });
    // 'payee' appears in both description and merchant_name; description is
    // processed first, so a header of ['payee'] binds to description (the
    // payee aliasing overlap is intentional per source).
    it("when only 'payee' is present, it maps to description (first target wins)", () => {
      const result = autoMapColumns(["payee"]);
      expect(result.description).toBe("payee");
      // merchant_name must fall through to an includes match; 'payee' includes 'payee'
      expect(result.merchant_name).toBe("payee");
    });

    // category
    it("matches alias 'category' to category", () => {
      expect(autoMapColumns(["category"]).category).toBe("category");
    });
    it("matches alias 'type' to category", () => {
      expect(autoMapColumns(["type"]).category).toBe("type");
    });
    it("matches alias 'classification' to category", () => {
      expect(autoMapColumns(["classification"]).category).toBe(
        "classification"
      );
    });
  });

  it("normalizes headers to lowercase for matching", () => {
    const result = autoMapColumns(["DATE", "AMOUNT", "DESCRIPTION"]);
    // Returns the ORIGINAL (non-normalized) header value.
    expect(result.transaction_date).toBe("DATE");
    expect(result.amount).toBe("AMOUNT");
    expect(result.description).toBe("DESCRIPTION");
  });

  it("trims whitespace when matching (exact-match pass after trim)", () => {
    // With trim: "  date  " normalises to "date" — exact match on alias
    const result = autoMapColumns(["  date  "]);
    expect(result.transaction_date).toBe("  date  ");
  });

  it("preserves the original header string (with whitespace) in the result", () => {
    // Even though the normaliser trims for matching, the returned value is
    // the original header (whitespace preserved) so the caller can refer back
    // to the user's column heading verbatim.
    expect(autoMapColumns(["  date  "]).transaction_date).toBe("  date  ");
  });

  it("pass 2: includes-based match for 'Transaction Date' header (not exact alias)", () => {
    // "transaction date" IS an exact alias, so this hits Pass 1.
    // For a true Pass 2 match, use something that only contains an alias
    // as a substring without being exactly that alias.
    const result = autoMapColumns(["Trans Date Column"]);
    // "trans date column" includes "trans date" (alias) -> Pass 2 match
    expect(result.transaction_date).toBe("Trans Date Column");
  });

  it("pass 2 kicks in when no exact match is found", () => {
    // 'My Memo Field' is not an exact alias but includes 'memo'
    const result = autoMapColumns(["My Memo Field"]);
    expect(result.description).toBe("My Memo Field");
  });

  it("pass 1 takes precedence: exact match beats includes match", () => {
    // Headers are processed in array order. For exact-match pass, the first
    // alias that matches any header wins. Here "amount" is in position [0]
    // and "transaction amount" is in position [1]. Pass 1 first tries
    // alias "amount" against headers: normalizedHeaders[0]="amount" matches.
    // So matched = "amount" (headers[0]).
    const result = autoMapColumns(["amount", "transaction amount"]);
    expect(result.amount).toBe("amount");
  });

  it("CRITICAL: exact-match header takes precedence over substring-match header (Pass 1 > Pass 2)", () => {
    // This kills mutations that disable Pass 1 (making it a no-op).
    // Headers: [A contains alias, B IS the alias]. Pass 1 finds B (exact).
    // Without Pass 1: Pass 2 finds A (first substring match).
    // Returns "payee" (exact match), not "X-payee-X" (substring).
    const result = autoMapColumns(["X-payee-X", "payee"]);
    expect(result.description).toBe("payee");
  });

  it("CRITICAL: exact alias in position 1 beats substring-match in position 0 (order matters)", () => {
    // Same distinguisher: if the substring-match header comes first and the
    // exact alias comes second, Pass 1 still picks the exact one.
    const result = autoMapColumns(["foo amount bar", "amount"]);
    expect(result.amount).toBe("amount");
  });

  it("Pass 2 stops at the FIRST matching header (outer break kills 'if (matched) break' -> false)", () => {
    // If the outer break were disabled, the loop would overwrite `matched` on
    // later header matches. We deliberately provide headers where header[0]
    // and header[1] BOTH match the description field via substring. Exact
    // match in Pass 1 must not fire — neither header is an exact alias.
    // - header[0] "my payee col" -> Pass 2 includes "payee" alias -> match
    //   csvHeaders[0]
    // - header[1] "my memo col"  -> Pass 2 would also match via "memo" alias
    // Expect the first-found match to be returned.
    const result = autoMapColumns(["my payee col", "my memo col"]);
    expect(result.description).toBe("my payee col");
  });

  it("Pass 2 inner break: stops at FIRST alias that matches a header (not the last)", () => {
    // For a single header that contains MULTIPLE aliases as substrings,
    // Pass 2 stops at the first alias match. If inner break were disabled,
    // the inner loop would continue and potentially re-set `matched`, but
    // the observable outcome for this input is the same header being
    // returned. We still assert on the exact mapped field to pin behaviour.
    const result = autoMapColumns(["memo for payee"]);
    // Description aliases include both "memo" (index 1) and "payee" (index 4).
    // "memo for payee".includes("memo") is true first, so inner break stops.
    expect(result.description).toBe("memo for payee");
  });

  it("returns null for unrecognised fields", () => {
    const result = autoMapColumns(["date", "amount"]);
    expect(result.description).toBeNull();
    expect(result.merchant_name).toBeNull();
    expect(result.category).toBeNull();
  });

  it("returns all nulls for completely unknown headers", () => {
    const result = autoMapColumns(["foo", "bar", "baz"]);
    expect(result).toEqual({
      transaction_date: null,
      amount: null,
      description: null,
      merchant_name: null,
      category: null,
    });
  });

  it("returns empty object result when no headers passed", () => {
    const result = autoMapColumns([]);
    expect(result).toEqual({
      transaction_date: null,
      amount: null,
      description: null,
      merchant_name: null,
      category: null,
    });
  });

  it("Pass 2 breaks out of inner alias loop after first match", () => {
    // Header "payee and name" would match both "payee" AND "name" in
    // description aliases. The `if (matched) break` inside Pass 2 means
    // it should match the FIRST alias it finds (aliases are iterated in
    // the array order). Description aliases: [description, memo, details,
    // narrative, payee, name]. "payee and name" includes "payee" (index 4)
    // first in the loop, so matched becomes "payee and name" -> returned.
    const result = autoMapColumns(["payee and name"]);
    expect(result.description).toBe("payee and name");
  });

  it("handles multi-column CSV with partial mapping", () => {
    const headers = ["Some ID", "posting date", "debit", "foo"];
    const result = autoMapColumns(headers);
    expect(result.transaction_date).toBe("posting date");
    expect(result.amount).toBe("debit");
    expect(result.description).toBeNull();
    expect(result.merchant_name).toBeNull();
    expect(result.category).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// transactionDuplicateKey
// ---------------------------------------------------------------------------

describe("transactionDuplicateKey", () => {
  it("produces the exact expected key format for a simple input", () => {
    expect(transactionDuplicateKey("2026-01-15", -1500, "Coffee Shop")).toBe(
      "2026-01-15|-1500|coffee shop"
    );
  });

  it("lowercases the description", () => {
    expect(transactionDuplicateKey("2026-01-15", 1000, "COFFEE")).toBe(
      "2026-01-15|1000|coffee"
    );
  });

  it("trims whitespace from description", () => {
    expect(
      transactionDuplicateKey("2026-01-15", 1000, "  Coffee Shop  ")
    ).toBe("2026-01-15|1000|coffee shop");
  });

  it("normalizes to same key regardless of whitespace/case", () => {
    const key1 = transactionDuplicateKey("2026-01-15", 1000, "  Coffee Shop  ");
    const key2 = transactionDuplicateKey("2026-01-15", 1000, "coffee shop");
    expect(key1).toBe(key2);
  });

  it("zero amount produces '|0|' in the middle", () => {
    expect(transactionDuplicateKey("2026-01-15", 0, "Free")).toBe(
      "2026-01-15|0|free"
    );
  });

  it("different dates produce different keys", () => {
    const key1 = transactionDuplicateKey("2026-01-15", 1000, "Test");
    const key2 = transactionDuplicateKey("2026-01-16", 1000, "Test");
    expect(key1).not.toBe(key2);
  });

  it("different amounts produce different keys", () => {
    const key1 = transactionDuplicateKey("2026-01-15", 1000, "Test");
    const key2 = transactionDuplicateKey("2026-01-15", 2000, "Test");
    expect(key1).not.toBe(key2);
  });

  it("uses pipe as the separator (not comma or other)", () => {
    const key = transactionDuplicateKey("2026-01-15", 1000, "Test");
    expect(key).toBe("2026-01-15|1000|test");
    // Verify parts using the pipe separator
    expect(key.split("|")).toEqual(["2026-01-15", "1000", "test"]);
  });
});

// ---------------------------------------------------------------------------
// detectDuplicates
// ---------------------------------------------------------------------------

describe("detectDuplicates", () => {
  it("detects a single matching duplicate and returns its index", () => {
    const importRows = [
      { date: "2026-01-15", amountCents: -1500, description: "Coffee" },
      { date: "2026-01-16", amountCents: -2500, description: "Lunch" },
    ];

    const existingRows = [
      {
        transaction_date: "2026-01-15",
        amount_cents: -1500,
        description: "coffee",
      },
    ];

    const duplicates = detectDuplicates(importRows, existingRows);
    expect(duplicates).toEqual(new Set([0]));
  });

  it("detects multiple duplicates at their original indices", () => {
    const importRows = [
      { date: "2026-01-15", amountCents: -1500, description: "Coffee" },
      { date: "2026-01-16", amountCents: -2500, description: "Lunch" },
      { date: "2026-01-17", amountCents: -3500, description: "Dinner" },
    ];

    const existingRows = [
      {
        transaction_date: "2026-01-15",
        amount_cents: -1500,
        description: "coffee",
      },
      {
        transaction_date: "2026-01-17",
        amount_cents: -3500,
        description: "dinner",
      },
    ];

    const duplicates = detectDuplicates(importRows, existingRows);
    expect(duplicates).toEqual(new Set([0, 2]));
  });

  it("returns empty set when both arrays are empty", () => {
    expect(detectDuplicates([], [])).toEqual(new Set());
  });

  it("returns empty set when existingRows is empty (nothing to match)", () => {
    const importRows = [
      { date: "2026-01-15", amountCents: -1500, description: "Coffee" },
    ];
    expect(detectDuplicates(importRows, [])).toEqual(new Set());
  });

  it("returns empty set when importRows is empty", () => {
    const existingRows = [
      {
        transaction_date: "2026-01-15",
        amount_cents: -1500,
        description: "coffee",
      },
    ];
    expect(detectDuplicates([], existingRows)).toEqual(new Set());
  });

  it("no duplicates found returns empty set (not undefined)", () => {
    const importRows = [
      { date: "2026-01-15", amountCents: -1500, description: "Coffee" },
    ];

    const existingRows = [
      {
        transaction_date: "2026-01-16",
        amount_cents: -2500,
        description: "Lunch",
      },
    ];

    const duplicates = detectDuplicates(importRows, existingRows);
    expect(duplicates).toEqual(new Set());
  });

  it("duplicate matching is case-insensitive and whitespace-tolerant", () => {
    const importRows = [
      { date: "2026-01-15", amountCents: -1500, description: "  COFFEE  " },
    ];

    const existingRows = [
      {
        transaction_date: "2026-01-15",
        amount_cents: -1500,
        description: "coffee",
      },
    ];

    const duplicates = detectDuplicates(importRows, existingRows);
    expect(duplicates).toEqual(new Set([0]));
  });

  it("DOES NOT treat different dates as duplicates (same amount+desc)", () => {
    const importRows = [
      { date: "2026-01-15", amountCents: -1500, description: "Coffee" },
    ];
    const existingRows = [
      {
        transaction_date: "2026-01-16",
        amount_cents: -1500,
        description: "coffee",
      },
    ];
    expect(detectDuplicates(importRows, existingRows)).toEqual(new Set());
  });

  it("DOES NOT treat different amounts as duplicates (same date+desc)", () => {
    const importRows = [
      { date: "2026-01-15", amountCents: -1500, description: "Coffee" },
    ];
    const existingRows = [
      {
        transaction_date: "2026-01-15",
        amount_cents: -1600,
        description: "coffee",
      },
    ];
    expect(detectDuplicates(importRows, existingRows)).toEqual(new Set());
  });
});
