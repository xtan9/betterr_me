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
});
