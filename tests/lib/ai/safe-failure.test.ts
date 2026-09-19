import { RetryError } from "ai";
import { describe, expect, it } from "vitest";
import { safeAiFailure } from "@/lib/ai/safe-failure";

describe("safeAiFailure", () => {
  it("keeps diagnostic metadata while omitting sensitive provider text", () => {
    const failure = Object.assign(new Error("private appointment details"), {
      code: "model_not_found",
      statusCode: 404,
      responseBody: "private response body",
    });

    const context = safeAiFailure(failure);

    expect(context).toEqual({ name: "Error", code: "model_not_found", statusCode: 404 });
    expect(JSON.stringify(context)).not.toContain("private");
  });

  it("handles non-object failures without echoing them", () => {
    expect(safeAiFailure("private prompt")).toEqual({ name: "UnknownFailure" });
  });

  it("extracts only allowlisted provider metadata from a JSON error body", () => {
    const context = safeAiFailure({
      name: "AI_APICallError",
      statusCode: 400,
      responseBody: JSON.stringify({
        error: {
          code: "unsupported_model",
          type: "invalid_request_error",
          param: "model",
          message: "private appointment and prompt details",
        },
      }),
    });

    expect(context).toEqual({
      name: "AI_APICallError",
      statusCode: 400,
      providerCode: "unsupported_model",
      providerType: "invalid_request_error",
      providerParam: "model",
    });
    expect(JSON.stringify(context)).not.toContain("private");
  });

  it("rejects arbitrary provider metadata and oversized response bodies", () => {
    const arbitrary = safeAiFailure({
      name: "AI_APICallError",
      responseBody: JSON.stringify({
        error: {
          code: "private-code",
          type: "private-type",
          param: "private-param",
          message: "private appointment details",
        },
      }),
    });
    const oversized = safeAiFailure({
      name: "AI_APICallError",
      responseBody: JSON.stringify({ error: { code: "model_not_found" }, padding: "x".repeat(8192) }),
    });

    expect(arbitrary).toEqual({ name: "AI_APICallError" });
    expect(oversized).toEqual({ name: "AI_APICallError" });
  });

  it("rejects arbitrary text and invalid status values in every inspected field", () => {
    const context = safeAiFailure({
      name: "private appointment details",
      code: "private appointment details",
      statusCode: "private appointment details",
      status: 999,
    });

    expect(context).toEqual({ name: "UnknownFailure" });
    expect(JSON.stringify(context)).not.toContain("private");
  });

  it("never throws when diagnostic properties have throwing getters", () => {
    const failure = new Proxy({}, {
      get() {
        throw new Error("private getter details");
      },
    });

    expect(safeAiFailure(failure)).toEqual({ name: "UnknownFailure" });
  });

  it("keeps bounded metadata from an exhausted AI SDK retry", () => {
    const failure = new RetryError({
      message: "private retry details",
      reason: "maxRetriesExceeded",
      errors: [{
        name: "AI_APICallError",
        code: "model_not_found",
        statusCode: 404,
        message: "private provider response",
      }],
    });

    const context = safeAiFailure(failure);

    expect(context).toEqual({ name: "AI_RetryError", code: "model_not_found", statusCode: 404 });
    expect(JSON.stringify(context)).not.toContain("private");
  });
});
